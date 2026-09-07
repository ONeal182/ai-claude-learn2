import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileStorageService } from '../../storage/file-storage.service.js';
import { PROCESS_RUNNER, type ProcessRunner } from './process-runner.js';
import { buildWhisperArgs } from './whisper-command.js';
import { type SttInput, type SttService } from './stt.service.js';

/**
 * Реальная транскрибация через whisper.cpp (`whisper-cli`) как внешний подпроцесс — без Python.
 *
 * Фаза 1 (tracer bullet) — только happy path для WAV: собрать аргументы, запустить бинарник
 * `WHISPER_BIN_PATH` с моделью `WHISPER_MODEL_PATH`, вернуть `stdout` движка. Язык — из
 * `WHISPER_LANGUAGE` (пусто → `-l auto`). Конвертация не-WAV через ffmpeg — Фаза 2; таймаут,
 * классификация ошибок и пустой вывод — Фаза 3.
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
    const inputPath = this.storage.absolutePath(input.storageKey);

    const result = await this.runner.run(
      binPath,
      buildWhisperArgs({ inputPath, modelPath, language }),
    );

    return result.stdout.trim();
  }
}
