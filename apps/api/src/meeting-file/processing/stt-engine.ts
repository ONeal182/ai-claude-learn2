/**
 * Выбор STT-движка — в отдельном модуле без зависимостей, чтобы на него могли ссылаться и
 * `meeting-file/` (фабрика `STT_SERVICE`), и `config/` (`validateEnv`), не связывая слои.
 */

/** Движок распознавания: `whisper` — реальный whisper.cpp, `stub` — детерминированная заглушка. */
export type SttEngine = 'whisper' | 'stub';

/**
 * Дефолт `STT_ENGINE`, если переменная не задана. С Фазы 4 — `whisper`: прод-конфигурация
 * обязана иметь установленный движок (`validateEnv` роняет старт в production без бинарника/модели),
 * локальный dev без движка получает `warn` и может явно выставить `STT_ENGINE=stub`.
 */
export const DEFAULT_STT_ENGINE: SttEngine = 'whisper';

const STT_ENGINES: readonly SttEngine[] = ['whisper', 'stub'];

/**
 * Единая нормализация значения `STT_ENGINE` для фабрики `STT_SERVICE` и `validateEnv` —
 * иначе `||`/`??` и trim/не-trim расходятся (пустая строка → фабрика падала `Unknown`).
 * Пусто / пробелы → `DEFAULT_STT_ENGINE`; неизвестное значение → `Error` (типоопечатка не должна
 * тихо превращаться в дефолт).
 */
export function resolveSttEngine(raw: string | undefined): SttEngine {
  const value = (raw ?? '').trim();
  if (!value) return DEFAULT_STT_ENGINE;
  if ((STT_ENGINES as readonly string[]).includes(value)) return value as SttEngine;
  throw new Error(`Unknown STT_ENGINE: "${raw}" (ожидается ${STT_ENGINES.join(' | ')} или пусто)`);
}
