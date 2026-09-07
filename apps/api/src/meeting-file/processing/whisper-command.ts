/**
 * Чистая сборка аргументов внешних процессов конвейера транскрибации.
 *
 * whisper.cpp (`whisper-cli`): вывод берётся из `stdout` с флагом `--no-timestamps` (`-nt`) —
 * plain-text транскрипт без таймкодов.
 * ffmpeg: приведение любого не-WAV входа к 16 кГц моно 16-bit PCM WAV, который ждёт whisper.
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

/** mime, которые whisper.cpp читает напрямую — конвертация не нужна (значения из `allowed-mime.ts`). */
const WAV_MIME_TYPES: ReadonlySet<string> = new Set(['audio/wav', 'audio/x-wav']);

export function needsConversion(mimeType: string): boolean {
  return !WAV_MIME_TYPES.has(mimeType);
}

/** ffmpeg: `inputPath` → 16 кГц моно 16-bit PCM WAV в `outputPath` (`-y` — перезаписать без вопросов). */
export function buildFfmpegArgs(inputPath: string, outputPath: string): string[] {
  return ['-i', inputPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-y', outputPath];
}
