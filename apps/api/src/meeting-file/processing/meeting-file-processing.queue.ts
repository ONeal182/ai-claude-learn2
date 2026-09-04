import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { STT_SERVICE, type SttService } from './stt.service.js';

/**
 * In-process очередь обработки записей встреч (без внешнего брокера — PRD выносит его за скоуп).
 *
 * Один воркер (`concurrency = 1`): для каждого `fileId` ведёт `pending → processing → done|failed`
 * и по успеху пишет `transcriptText`. Триггерится доменным событием
 * `MeetingFileUploadedEvent` (см. `events/`), а также `reprocess`.
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

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STT_SERVICE) private readonly stt: SttService,
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
    try {
      const file = await this.prisma.meetingFile.findUnique({ where: { id: fileId } });
      if (!file || this.stopped) return;

      await this.prisma.meetingFile.update({
        where: { id: fileId },
        data: { status: 'processing' },
      });

      const transcriptText = await this.stt.transcribe({
        originalName: file.originalName,
        size: file.size,
      });
      if (this.stopped) return;

      await this.prisma.meetingFile.update({
        where: { id: fileId },
        data: { status: 'done', transcriptText },
      });
    } catch (error) {
      if (this.stopped) return;
      // запись удалили, пока она обрабатывалась (`DELETE`) — ничего не делаем
      if (isRecordNotFound(error)) return;
      this.logger.warn(`Обработка файла ${fileId} упала: ${errorMessage(error)}`);
      await this.prisma.meetingFile
        .update({ where: { id: fileId }, data: { status: 'failed' } })
        .catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    this.pending.length = 0;
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
