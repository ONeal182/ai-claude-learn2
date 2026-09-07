import { ConfigService } from '@nestjs/config';
import { FileStorageService } from '../../storage/file-storage.service.js';
import { type ProcessRunner } from './process-runner.js';
import { WhisperSttService } from './whisper-stt.service.js';
import { type SttInput } from './stt.service.js';

/**
 * Фаза 1 — happy path: `WhisperSttService` строит запуск whisper.cpp и отдаёт распознанный текст.
 * `PROCESS_RUNNER` подменён `vi.fn()` (`useValue`-стиль, как в `change-password.handler.spec.ts`) —
 * реальный whisper.cpp/ffmpeg в unit-тестах не нужен. Ветки ошибок и пустой вывод — Фаза 3.
 */
describe('WhisperSttService', () => {
  let runner: { run: ReturnType<typeof vi.fn> };

  const storage = {
    absolutePath: (key: string): string => `/abs/uploads/${key}`,
  } as unknown as FileStorageService;

  const input: SttInput = {
    originalName: 'call.wav',
    size: 4321,
    storageKey: 'file-key-1',
    mimeType: 'audio/wav',
  };

  function makeConfig(values: Record<string, string>): ConfigService {
    return {
      get: (key: string, fallback?: unknown) => values[key] ?? fallback ?? '',
    } as unknown as ConfigService;
  }

  function build(values: Record<string, string>): WhisperSttService {
    runner = { run: vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '', code: 0 }) };
    return new WhisperSttService(runner as unknown as ProcessRunner, makeConfig(values), storage);
  }

  it('запускает WHISPER_BIN_PATH с -m <модель>, -l auto (пустой язык) и абсолютным путём файла', async () => {
    const service = build({
      WHISPER_BIN_PATH: '/opt/whisper/whisper-cli',
      WHISPER_MODEL_PATH: '/models/ggml-tiny.bin',
      WHISPER_LANGUAGE: '',
    });
    runner.run.mockResolvedValue({ stdout: 'привет', stderr: '', code: 0 });

    await service.transcribe(input);

    expect(runner.run).toHaveBeenCalledTimes(1);
    const [command, args] = runner.run.mock.calls[0] as [string, string[]];
    expect(command).toBe('/opt/whisper/whisper-cli');
    expect(args).toEqual(expect.arrayContaining(['-m', '/models/ggml-tiny.bin']));
    expect(args).toEqual(expect.arrayContaining(['-l', 'auto']));
    expect(args).toContain('-nt');
    expect(args).toContain('/abs/uploads/file-key-1');
  });

  it('WHISPER_LANGUAGE=ru → аргумент -l ru', async () => {
    const service = build({
      WHISPER_BIN_PATH: '/opt/whisper/whisper-cli',
      WHISPER_MODEL_PATH: '/models/ggml-tiny.bin',
      WHISPER_LANGUAGE: 'ru',
    });

    await service.transcribe(input);

    const [, args] = runner.run.mock.calls[0] as [string, string[]];
    const langFlagAt = args.indexOf('-l');
    expect(langFlagAt).toBeGreaterThanOrEqual(0);
    expect(args[langFlagAt + 1]).toBe('ru');
  });

  it('возвращает stdout движка, обрезая хвостовые пробелы и переводы строк', async () => {
    const service = build({
      WHISPER_BIN_PATH: '/opt/whisper/whisper-cli',
      WHISPER_MODEL_PATH: '/models/ggml-tiny.bin',
    });
    runner.run.mockResolvedValue({
      stdout: '  Привет, это тестовая запись.\n\n',
      stderr: '',
      code: 0,
    });

    await expect(service.transcribe(input)).resolves.toBe('Привет, это тестовая запись.');
  });
});
