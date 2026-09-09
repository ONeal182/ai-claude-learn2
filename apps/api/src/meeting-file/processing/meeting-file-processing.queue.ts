import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { MeetingFileStatus } from '@prisma/client';
import { FileLoggerService } from '../../common/file-logger.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MeetingFileTranscribedEvent } from '../events/impl/meeting-file-transcribed.event.js';
import { STT_SERVICE, type SttService } from './stt.service.js';

/**
 * In-process очередь обработки записей встреч (без внешнего брокера — PRD выносит его за скоуп).
 *
 * Один воркер (`concurrency = 1`): для каждого `fileId` ведёт `pending → processing → done|failed`
 * и по успеху пишет `transcriptText`. Триггерится доменным событием
 * `MeetingFileProcessingRequestedEvent` (см. `events/`) — от загрузки `recording` и от `reprocess`.
 *
 * `OnModuleDestroy` обязателен: e2e в `afterEach` делают `app.close()`, и «догорающая» задача
 * не должна писать в уже отключённый `PrismaClient` (иначе плавающие падения e2e и pre-commit).
 * Durability между рестартами не гарантируется — зависшие `pending`/`processing` не возобновляются.
 */
@Injectable()
export class MeetingFileProcessingQueue implements OnModuleDestroy {
  private readonly logger = new Logger(MeetingFileProcessingQueue.name);
  private readonly pending: string[] = [];
  private draining = false;
  private stopped = false;
  private current: Promise<void> | null = null;
  /** Контроллер отмены активной задачи — `abort()` в `onModuleDestroy` рвёт подпроцесс движка. */
  private currentAbort: AbortController | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STT_SERVICE) private readonly stt: SttService,
    private readonly eventBus: EventBus,
    private readonly fileLogger: FileLoggerService,
  ) {}

  /** Поставить файл в очередь на обработку. Возврат мгновенный — работа идёт в фоне. */
  enqueue(fileId: string): void {
    if (this.stopped) return;
    this.pending.push(fileId);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (!this.stopped && this.pending.length > 0) {
        const fileId = this.pending.shift();
        if (fileId === undefined) break;
        this.current = this.process(fileId);
        await this.current;
        this.current = null;
      }
    } finally {
      this.draining = false;
    }
  }

  private async process(fileId: string): Promise<void> {
    this.currentAbort = new AbortController();
    const startTime = Date.now();
    const logPath = this.fileLogger.getLogPath('logs/transcription', 'transcription.log');

    try {
      const file = await this.prisma.meetingFile.findUnique({ where: { id: fileId } });
      if (!file || this.stopped) return;

      // Лог начала транскрипции
      await this.fileLogger.log(logPath, 'Transcription started', {
        fileId,
        meetingId: file.meetingId,
        fileName: file.originalName,
        fileSize: file.size,
        mimeType: file.mimeType,
      });

      await this.prisma.meetingFile.update({
        where: { id: fileId },
        data: { status: MeetingFileStatus.processing },
      });

      const transcriptText = await this.stt.transcribe({
        originalName: file.originalName,
        size: file.size,
        storageKey: file.storageKey,
        mimeType: file.mimeType,
        signal: this.currentAbort.signal,
      });
      if (this.stopped) return;

      const duration = Date.now() - startTime;
      const transcriptLength = transcriptText.length;

      await this.prisma.meetingFile.update({
        where: { id: fileId },
        data: { status: MeetingFileStatus.done, transcriptText },
      });

      // Лог успешной транскрипции
      await this.fileLogger.log(logPath, 'Transcription completed', {
        fileId,
        meetingId: file.meetingId,
        fileName: file.originalName,
        durationMs: duration,
        transcriptLength,
        status: 'success',
      });

      this.logger.log(
        `Транскрипция завершена: ${file.originalName} (${duration}ms, ${transcriptLength} символов)`,
      );

      // Публикуем событие для триггера суммаризации всей встречи
      this.logger.log(
        `Публикуем MeetingFileTranscribedEvent для файла ${fileId}, встреча ${file.meetingId}`,
      );
      this.eventBus.publish(new MeetingFileTranscribedEvent(fileId, file.meetingId));
      this.logger.log(`MeetingFileTranscribedEvent опубликован для встречи ${file.meetingId}`);
    } catch (error) {
      if (this.stopped) return;
      // запись удалили, пока она обрабатывалась (`DELETE`) — ничего не делаем
      if (isRecordNotFound(error)) return;

      const duration = Date.now() - startTime;
      const errorMsg = errorMessage(error);

      // Лог ошибки транскрипции
      await this.fileLogger.log(logPath, 'Transcription failed', {
        fileId,
        durationMs: duration,
        error: errorMsg,
        status: 'failed',
      });

      this.logger.warn(`Обработка файла ${fileId} упала: ${errorMsg}`);
      await this.prisma.meetingFile
        .update({ where: { id: fileId }, data: { status: MeetingFileStatus.failed } })
        .catch(() => undefined);
    } finally {
      this.currentAbort = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    // порядок важен: `stopped` первым — тогда `catch`/пост-await ветки process() не тронут БД;
    // затем рвём подпроцесс движка и дожидаемся «догорания» текущей задачи
    this.stopped = true;
    this.pending.length = 0;
    this.currentAbort?.abort();
    if (this.current) {
      await this.current.catch(() => undefined);
    }
  }
}

function isRecordNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2025'
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
