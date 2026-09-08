import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { MeetingFileStatus, MeetingFileType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SUMMARY_SERVICE, type SummaryService } from './summary.service.js';

/**
 * In-process очередь суммаризации транскриптов встреч (без внешнего брокера).
 *
 * Один воркер (`concurrency = 1`): для каждого `fileId` ведёт `summaryStatus: pending → processing → done|failed`
 * и по успеху пишет `summary`. Триггерится доменным событием `MeetingFileTranscribedEvent`
 * (когда `MeetingFileProcessingQueue` переводит файл в `status=done`).
 *
 * Обрабатывает только `type=recording` с непустым `transcriptText` — иначе молча выходит.
 *
 * `OnModuleDestroy` обязателен: e2e в `afterEach` делают `app.close()`, и «догорающая» задача
 * не должна писать в уже отключённый `PrismaClient`.
 */
@Injectable()
export class MeetingFileSummaryQueue implements OnModuleDestroy {
  private readonly logger = new Logger(MeetingFileSummaryQueue.name);
  private readonly pending: string[] = [];
  private draining = false;
  private stopped = false;
  private current: Promise<void> | null = null;
  /** Контроллер отмены активной задачи — `abort()` в `onModuleDestroy` рвёт вызов движка. */
  private currentAbort: AbortController | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SUMMARY_SERVICE) private readonly summaryService: SummaryService,
  ) {}

  /** Поставить файл в очередь на суммаризацию. Возврат мгновенный — работа идёт в фоне. */
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
    try {
      const file = await this.prisma.meetingFile.findUnique({ where: { id: fileId } });
      if (!file || this.stopped) return;

      // Пропускаем attachment и файлы без транскрипта — суммаризация неприменима
      if (file.type !== MeetingFileType.recording || !file.transcriptText) {
        return;
      }

      await this.prisma.meetingFile.update({
        where: { id: fileId },
        data: { summaryStatus: MeetingFileStatus.processing },
      });

      // Вызов SUMMARY_SERVICE обёрнут в try-catch: любой сбой (аутентификация, невалидный ответ,
      // превышен контекст) переводит в failed без записи частичного summary
      let summary;
      try {
        summary = await this.summaryService.summarize({
          transcriptText: file.transcriptText,
          originalName: file.originalName,
          signal: this.currentAbort.signal,
        });
      } catch (error) {
        if (this.stopped) return;
        this.logger.warn(`Суммаризация файла ${fileId} упала: ${errorMessage(error)}`);
        // summaryStatus = failed, summary не трогаем, продолжаем к следующему файлу
        try {
          await this.prisma.meetingFile.update({
            where: { id: fileId },
            data: { summaryStatus: MeetingFileStatus.failed },
          });
        } catch (updateError) {
          // P2025 — файл удалили во время обработки — молча пропускаем
          if (!isRecordNotFound(updateError)) {
            this.logger.error(`Не удалось обновить summaryStatus: ${errorMessage(updateError)}`);
          }
        }
        return;
      }

      if (this.stopped) return;

      try {
        await this.prisma.meetingFile.update({
          where: { id: fileId },
          data: { summaryStatus: MeetingFileStatus.done, summary: summary as never },
        });
      } catch (error) {
        // P2025 — файл удалили после успешной суммаризации — молча пропускаем
        if (!isRecordNotFound(error)) {
          this.logger.error(`Не удалось записать summary: ${errorMessage(error)}`);
        }
      }
    } finally {
      this.currentAbort = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    // порядок важен: `stopped` первым — тогда `catch`/пост-await ветки process() не тронут БД;
    // затем рвём активный вызов движка и дожидаемся «догорания» текущей задачи
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
