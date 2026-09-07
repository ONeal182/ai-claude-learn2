/**
 * Чистая сборка аргументов запуска whisper.cpp (`whisper-cli`).
 *
 * Вывод берётся из `stdout` с флагом `--no-timestamps` (`-nt`) — это plain-text транскрипт
 * без таймкодов. Фаза 2 добавит сюда сборку аргументов конвертации не-WAV через ffmpeg.
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
