/**
 * Движок суммаризации транскриптов встреч. Dependency-free модуль — импортируется и
 * `meeting-file.module.ts` (фабрика `SUMMARY_SERVICE`), и `config/validate-env.ts`.
 */

export type SummaryEngine = 'stub' | 'claude';

/** Дефолт Фазы 2 — claude (реальная суммаризация через Claude Agent SDK). */
export const DEFAULT_SUMMARY_ENGINE: SummaryEngine = 'claude';

/**
 * Нормализация значения `SUMMARY_ENGINE` из окружения: пустая строка / whitespace →
 * `DEFAULT_SUMMARY_ENGINE`, неизвестное значение → throw. Используется и в провайдере
 * `SUMMARY_SERVICE`, и в `validateEnv`.
 */
export function resolveSummaryEngine(raw: string | undefined): SummaryEngine {
  const normalized = (raw ?? '').trim().toLowerCase();
  if (normalized === '' || normalized === 'stub') return 'stub';
  if (normalized === 'claude') return 'claude';
  throw new Error(
    `SUMMARY_ENGINE должен быть 'stub' или 'claude', получено: '${raw}'. Проверьте .env / окружение.`,
  );
}
