/**
 * Чистая сборка аргументов запуска whisper.cpp (`whisper-cli`).
 *
 * Фаза 1 — только `buildWhisperArgs`. Конвертация не-WAV (`needsConversion` / `buildFfmpegArgs`)
 * добавляется в Фазе 2. Вывод берётся из `stdout` с флагом `--no-timestamps` (`-nt`) — это
 * plain-text транскрипт без таймкодов.
 */

export interface WhisperArgsInput {
  /** Абсолютный путь к аудиофайлу (WAV) на диске. */
  inputPath: string;
  /** Путь к ggml-модели whisper (`WHISPER_MODEL_PATH`). */
  modelPath: string;
  /** Значение `WHISPER_LANGUAGE`; пусто/пробелы → авто-детект (`-l auto`). */
  language: string;
}

export function buildWhisperArgs({ inputPath, modelPath, language }: WhisperArgsInput): string[] {
  const lang = language.trim() || 'auto';
  return ['-m', modelPath, '-l', lang, '-nt', '-f', inputPath];
}
