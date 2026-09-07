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
