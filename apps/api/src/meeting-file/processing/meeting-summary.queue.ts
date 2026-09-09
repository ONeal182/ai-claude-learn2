import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MeetingFileType, MeetingFileStatus } from '@prisma/client';
import { FileLoggerService } from '../../common/file-logger.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SUMMARY_SERVICE, type SummaryService } from './summary.service.js';
import { MeetingStatusChangedEvent } from '../../meeting-updates/events/meeting-status-changed.event.js';

/**
 * In-process очередь суммаризации встреч (без внешнего брокера).
 *
 * Один воркер (`concurrency = 1`): для каждого `meetingId` собирает все транскрипты
 * из файлов встречи и суммаризирует их вместе. Статус ведётся на уровне Meeting:
 * `summaryStatus: null → processing → done|failed`.
 *
 * Триггерится доменным событием `MeetingFileTranscribedEvent` (когда любой файл встречи
 * переводится в `status=done` с транскриптом).
 *
 * `OnModuleDestroy` обязателен: e2e в `afterEach` делают `app.close()`, и «догорающая» задача
 * не должна писать в уже отключённый `PrismaClient`.
 */
@Injectable()
export class MeetingSummaryQueue implements OnModuleDestroy {
  private readonly logger = new Logger(MeetingSummaryQueue.name);
  private readonly pending: string[] = [];
  private draining = false;
  private stopped = false;
  private current: Promise<void> | null = null;
  /** Контроллер отмены активной задачи — `abort()` в `onModuleDestroy` рвёт вызов движка. */
  private currentAbort: AbortController | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SUMMARY_SERVICE) private readonly summaryService: SummaryService,
    private readonly fileLogger: FileLoggerService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Поставить встречу в очередь на суммаризацию. Возврат мгновенный — работа идёт в фоне. */
  enqueue(meetingId: string): void {
    if (this.stopped) return;

    this.logger.log(`MeetingSummaryQueue.enqueue вызван для встречи ${meetingId}`);

    // Дедупликация: если встреча уже в очереди, не добавляем повторно
    if (this.pending.includes(meetingId)) {
      this.logger.log(`Встреча ${meetingId} уже в очереди суммаризации, пропускаем`);
      return;
    }

    this.pending.push(meetingId);
    this.logger.log(
      `Встреча ${meetingId} добавлена в очередь суммаризации. Всего в очереди: ${this.pending.length}`,
    );
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    this.logger.log(`Начинаем обработку очереди суммаризации. В очереди: ${this.pending.length}`);
    try {
      while (!this.stopped && this.pending.length > 0) {
        const meetingId = this.pending.shift();
        if (meetingId === undefined) break;
        this.logger.log(`Извлекаем встречу ${meetingId} из очереди для обработки`);
        this.current = this.process(meetingId);
        await this.current;
        this.current = null;
      }
    } finally {
      this.draining = false;
      this.logger.log(`Обработка очереди суммаризации завершена`);
    }
  }

  private async process(meetingId: string): Promise<void> {
    this.currentAbort = new AbortController();
    const startTime = Date.now();
    const logPath = this.fileLogger.getLogPath('logs/summarization', 'summarization.log');

    try {
      const meeting = await this.prisma.meeting.findUnique({
        where: { id: meetingId },
        include: {
          files: {
            where: {
              type: MeetingFileType.recording,
              status: MeetingFileStatus.done,
              transcriptText: { not: null },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!meeting || this.stopped) return;

      // Если нет файлов с транскриптами — пропускаем суммаризацию
      if (meeting.files.length === 0) {
        this.logger.warn(`Встреча ${meetingId} не имеет файлов с транскриптами — пропускаем`);
        await this.fileLogger.log(logPath, 'Summarization skipped - no transcripts', {
          meetingId,
          meetingTitle: meeting.title,
        });
        return;
      }

      // Лог начала суммаризации
      await this.fileLogger.log(logPath, 'Summarization started', {
        meetingId,
        meetingTitle: meeting.title,
        filesCount: meeting.files.length,
        fileNames: meeting.files.map((f) => f.originalName),
      });

      // Обновить статус на processing
      await this.prisma.meeting.update({
        where: { id: meetingId },
        data: { summaryStatus: MeetingFileStatus.processing },
      });

      // Публикуем событие об изменении статуса
      this.eventEmitter.emit(
        'meeting.status.changed',
        new MeetingStatusChangedEvent(meetingId, MeetingFileStatus.processing, null, null),
      );

      // Собрать все транскрипты в один текст
      const combinedTranscript = meeting.files
        .map((file, index) => {
          const header = `=== Файл ${index + 1}: ${file.originalName} ===\n`;
          return header + (file.transcriptText || '');
        })
        .join('\n\n');

      const transcriptLength = combinedTranscript.length;

      // Вызов SUMMARY_SERVICE обёрнут в try-catch: любой сбой переводит в failed
      let summary;
      try {
        summary = await this.summaryService.summarize({
          transcriptText: combinedTranscript,
          originalName: meeting.files[0].originalName,
          meetingId: meeting.id,
          signal: this.currentAbort.signal,
        });
      } catch (error) {
        if (this.stopped) return;

        const duration = Date.now() - startTime;
        const errorMsg = errorMessage(error);

        // Лог ошибки суммаризации
        await this.fileLogger.log(logPath, 'Summarization failed', {
          meetingId,
          meetingTitle: meeting.title,
          durationMs: duration,
          transcriptLength,
          error: errorMsg,
          status: 'failed',
        });

        this.logger.warn(`Суммаризация встречи ${meetingId} упала: ${errorMsg}`);

        try {
          await this.prisma.meeting.update({
            where: { id: meetingId },
            data: { summaryStatus: MeetingFileStatus.failed },
          });

          // Публикуем событие о неудаче
          this.eventEmitter.emit(
            'meeting.status.changed',
            new MeetingStatusChangedEvent(meetingId, MeetingFileStatus.failed, null, null),
          );
        } catch (updateError) {
          if (!isRecordNotFound(updateError)) {
            this.logger.error(`Не удалось обновить summaryStatus: ${errorMessage(updateError)}`);
          }
        }
        return;
      }

      if (this.stopped) return;

      const duration = Date.now() - startTime;

      // Сохранить резюме в Meeting
      try {
        await this.prisma.meeting.update({
          where: { id: meetingId },
          data: {
            summaryStatus: MeetingFileStatus.done,
            summary: summary.summary,
            decisions: summary.decisions,
          },
        });

        // Публикуем событие об успешной суммаризации
        this.eventEmitter.emit(
          'meeting.status.changed',
          new MeetingStatusChangedEvent(
            meetingId,
            MeetingFileStatus.done,
            summary.summary,
            summary.decisions,
          ),
        );

        // Лог успешной суммаризации
        await this.fileLogger.log(logPath, 'Summarization completed', {
          meetingId,
          meetingTitle: meeting.title,
          durationMs: duration,
          transcriptLength,
          summaryLength: summary.summary.length,
          decisionsCount: summary.decisions.length,
          actionItemsCount: summary.actionItems.length,
          status: 'success',
        });

        this.logger.log(
          `Суммаризация встречи ${meetingId} завершена: ${summary.decisions.length} решений, ${summary.actionItems.length} задач (${duration}ms)`,
        );
      } catch (error) {
        if (!isRecordNotFound(error)) {
          this.logger.error(`Не удалось записать summary: ${errorMessage(error)}`);
        }
      }
    } finally {
      this.currentAbort = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
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
