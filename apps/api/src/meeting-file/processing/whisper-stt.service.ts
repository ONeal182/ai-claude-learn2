import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStorageService } from '../../storage/file-storage.service.js';
import { PROCESS_RUNNER, type ProcessRunner } from './process-runner.js';
import { buildFfmpegArgs, buildWhisperArgs, needsConversion } from './whisper-command.js';
import { type SttInput, type SttService } from './stt.service.js';

/** ffmpeg берётся из `PATH` — ставится системно, отдельная env-переменная не вводится. */
const FFMPEG_BIN = 'ffmpeg';

/**
 * Реальная транскрибация через whisper.cpp (`whisper-cli`) как внешний подпроцесс — без Python.
 *
 * Фаза 1: happy path для WAV. Фаза 2: не-WAV вход (mp3/m4a/webm/ogg/mp4/mov) перед whisper
 * конвертируется в 16 кГц моно 16-bit WAV через ffmpeg во временный каталог; каталог всегда
 * убирается в `finally` (успех и ошибка). Таймаут, классификация ошибок и пустой вывод — Фаза 3.
 */
@Injectable()
export class WhisperSttService implements SttService {
  constructor(
    @Inject(PROCESS_RUNNER) private readonly runner: ProcessRunner,
    private readonly config: ConfigService,
    private readonly storage: FileStorageService,
  ) {}

  async transcribe(input: SttInput): Promise<string> {
    const binPath = this.config.get<string>('WHISPER_BIN_PATH', '');
    const modelPath = this.config.get<string>('WHISPER_MODEL_PATH', '');
    const language = this.config.get<string>('WHISPER_LANGUAGE', '');
    const tmpBase = this.config.get<string>('WHISPER_TMP_DIR', '') || tmpdir();

    const sourcePath = this.storage.absolutePath(input.storageKey);
    const workDir = await mkdtemp(join(tmpBase, 'whisper-'));
    try {
      let audioPath = sourcePath;
      if (needsConversion(input.mimeType)) {
        audioPath = join(workDir, 'input.wav');
        await this.runner.run(FFMPEG_BIN, buildFfmpegArgs(sourcePath, audioPath));
      }

      const result = await this.runner.run(
        binPath,
        buildWhisperArgs({ inputPath: audioPath, modelPath, language }),
      );

      return result.stdout.trim();
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
