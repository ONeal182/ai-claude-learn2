import { Injectable } from '@nestjs/common';

/** DI-токен для реализации суммаризации — потребители зависят от интерфейса, не от класса. */
export const SUMMARY_SERVICE = Symbol('SUMMARY_SERVICE');

// `SummaryEngine` / `DEFAULT_SUMMARY_ENGINE` / `resolveSummaryEngine` — в `summary-engine.ts` (модуль без зависимостей).

export interface SummaryInput {
  /** Текст транскрипта для суммаризации. */
  transcriptText: string;
  /** Имя оригинального файла — может быть включено в summary для контекста. */
  originalName: string;
  /** ID встречи, к которой относится этот файл (для ограничения операций с задачами). */
  meetingId: string;
  /** Прерывание суммаризации (таймаут / остановка приложения). */
  signal?: AbortSignal;
}

export interface MeetingFileSummary {
  /** Краткое резюме встречи (1-2 абзаца). */
  summary: string;
  /** Список принятых решений. */
  decisions: string[];
  /** Список задач и действий. */
  actionItems: string[];
}

export interface SummaryService {
  summarize(input: SummaryInput): Promise<MeetingFileSummary>;
}

/**
 * Stub-реализация суммаризации для Фазы 1 (реальный Claude — Фаза 2).
 * Детерминированная: резюме выводится из метаданных файла, без реального парсинга транскрипта.
 * Включает `originalName` и timestamp в текст summary для проверки, что входные данные передаются корректно
 * и что каждый вызов генерирует новое резюме.
 */
@Injectable()
export class StubSummaryService implements SummaryService {
  summarize(input: SummaryInput): Promise<MeetingFileSummary> {
    const timestamp = new Date().toISOString();
    return Promise.resolve({
      summary: `Резюме встречи из файла «${input.originalName}» (сгенерировано ${timestamp}). Обсуждались текущие задачи и планы на следующий спринт.`,
      decisions: [
        `Решение по файлу «${input.originalName}»: продолжить разработку согласно плану.`,
      ],
      actionItems: [
        `Задача по файлу «${input.originalName}»: подготовить отчёт к следующей встрече.`,
      ],
    });
  }
}
