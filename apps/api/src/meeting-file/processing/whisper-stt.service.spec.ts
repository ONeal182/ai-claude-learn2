import { ConfigService } from '@nestjs/config';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStorageService } from '../../storage/file-storage.service.js';
import { type ProcessRunner } from './process-runner.js';
import { WhisperSttService } from './whisper-stt.service.js';
import { type SttInput } from './stt.service.js';

/**
 * `WhisperSttService`: сборка запуска whisper.cpp (Фаза 1) + конвертация не-WAV через ffmpeg
 * и очистка временного каталога (Фаза 2) + устойчивость — пред-проверки бинарника/модели,
 * таймаут `WHISPER_TIMEOUT_MS`, проброс `signal`, классификация сбоев, пустой вывод (Фаза 3).
 * `PROCESS_RUNNER` подменён `vi.fn()` — реальный whisper.cpp/ffmpeg в unit-тестах не нужен.
 */
describe('WhisperSttService', () => {
  let runner: { run: ReturnType<typeof vi.fn> };
  let tmpBase: string;
  /** Каталог с фейковыми файлами движка — отдельно от `WHISPER_TMP_DIR`, чтобы не мешать readdir. */
  let engineDir: string;
  let binPath: string;
  let modelPath: string;

  const storage = {
    absolutePath: (key: string): string => `/abs/uploads/${key}`,
  } as unknown as FileStorageService;

  const wavInput: SttInput = {
    originalName: 'call.wav',
    size: 4321,
    storageKey: 'file-key-1',
    mimeType: 'audio/wav',
  };

  const mp3Input: SttInput = {
    originalName: 'call.mp3',
    size: 4321,
    storageKey: 'file-key-1',
    mimeType: 'audio/mpeg',
  };

  beforeEach(async () => {
    tmpBase = await mkdtemp(join(tmpdir(), 'whisper-stt-spec-'));
    engineDir = await mkdtemp(join(tmpdir(), 'whisper-engine-spec-'));
    binPath = join(engineDir, 'whisper-cli');
    modelPath = join(engineDir, 'ggml-tiny.bin');
    await writeFile(binPath, '');
    await writeFile(modelPath, '');
  });

  afterEach(async () => {
    await rm(tmpBase, { recursive: true, force: true });
    await rm(engineDir, { recursive: true, force: true });
  });

  function makeConfig(values: Record<string, string>): ConfigService {
    return {
      get: (key: string, fallback?: unknown) => values[key] ?? fallback ?? '',
    } as unknown as ConfigService;
  }

  function build(values: Record<string, string>): WhisperSttService {
    runner = {
      run: vi
        .fn()
        .mockImplementation((_cmd: string, _args: string[], opts?: { signal?: AbortSignal }) => {
          if (opts?.signal?.aborted) return Promise.reject(new Error('aborted'));
          return Promise.resolve({ stdout: 'ok', stderr: '', code: 0 });
        }),
    };
    const config = makeConfig({ WHISPER_TMP_DIR: tmpBase, ...values });
    return new WhisperSttService(runner as unknown as ProcessRunner, config, storage);
  }

  let whisperEnv: Record<string, string>;
  beforeEach(() => {
    whisperEnv = { WHISPER_BIN_PATH: binPath, WHISPER_MODEL_PATH: modelPath };
  });

  it('запускает WHISPER_BIN_PATH с -m <модель>, -l auto (пустой язык) и абсолютным путём файла', async () => {
    const service = build({ ...whisperEnv, WHISPER_LANGUAGE: '' });
    runner.run.mockResolvedValue({ stdout: 'привет', stderr: '', code: 0 });

    await service.transcribe(wavInput);

    expect(runner.run).toHaveBeenCalledTimes(1);
    const [command, args] = runner.run.mock.calls[0] as [string, string[]];
    expect(command).toBe(binPath);
    expect(args).toEqual(expect.arrayContaining(['-m', modelPath]));
    expect(args).toEqual(expect.arrayContaining(['-l', 'auto']));
    expect(args).toContain('-nt');
    expect(args).toContain('/abs/uploads/file-key-1');
  });

  it('WHISPER_LANGUAGE=ru → аргумент -l ru', async () => {
    const service = build({ ...whisperEnv, WHISPER_LANGUAGE: 'ru' });

    await service.transcribe(wavInput);

    const [, args] = runner.run.mock.calls[0] as [string, string[]];
    const langFlagAt = args.indexOf('-l');
    expect(langFlagAt).toBeGreaterThanOrEqual(0);
    expect(args[langFlagAt + 1]).toBe('ru');
  });

  it('возвращает stdout движка, обрезая хвостовые пробелы и переводы строк', async () => {
    const service = build(whisperEnv);
    runner.run.mockResolvedValue({
      stdout: '  Привет, это тестовая запись.\n\n',
      stderr: '',
      code: 0,
    });

    await expect(service.transcribe(wavInput)).resolves.toBe('Привет, это тестовая запись.');
  });

  it('audio/wav и audio/x-wav идут в whisper напрямую, без вызова ffmpeg', async () => {
    const service = build(whisperEnv);

    await service.transcribe(wavInput);
    await service.transcribe({ ...wavInput, mimeType: 'audio/x-wav' });

    expect(runner.run).toHaveBeenCalledTimes(2);
    for (const [command, args] of runner.run.mock.calls as Array<[string, string[]]>) {
      expect(command).toBe(binPath);
      expect(args).toContain('/abs/uploads/file-key-1');
    }
  });

  it('не-WAV: сначала ffmpeg → 16 кГц моно 16-bit WAV во временном каталоге, затем whisper по этому WAV', async () => {
    const service = build(whisperEnv);

    await service.transcribe(mp3Input);

    expect(runner.run).toHaveBeenCalledTimes(2);

    const [ffmpegCmd, ffmpegArgs] = runner.run.mock.calls[0] as [string, string[]];
    expect(ffmpegCmd).toBe('ffmpeg');
    expect(ffmpegArgs).toEqual(
      expect.arrayContaining(['-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le']),
    );
    expect(ffmpegArgs).toContain('/abs/uploads/file-key-1'); // исходный файл на входе ffmpeg
    const convertedWav = ffmpegArgs[ffmpegArgs.length - 1];
    expect(convertedWav.startsWith(tmpBase)).toBe(true);
    expect(convertedWav.endsWith('input.wav')).toBe(true);

    const [whisperCmd, whisperArgs] = runner.run.mock.calls[1] as [string, string[]];
    expect(whisperCmd).toBe(binPath);
    expect(whisperArgs).toContain(convertedWav); // whisper читает сконвертированный WAV
    expect(whisperArgs).not.toContain('/abs/uploads/file-key-1');
  });

  it('после успешной транскрибации временный каталог удалён', async () => {
    const service = build(whisperEnv);

    await service.transcribe(mp3Input);

    expect(await readdir(tmpBase)).toEqual([]);
  });

  it('временный каталог удаляется и когда whisper падает', async () => {
    const service = build(whisperEnv);
    runner.run
      .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }) // ffmpeg
      .mockRejectedValueOnce(new Error('whisper упал')); // whisper

    await expect(service.transcribe(mp3Input)).rejects.toThrow('whisper упал');

    expect(await readdir(tmpBase)).toEqual([]);
  });

  it('падение ffmpeg: whisper не запускается, временный каталог удалён', async () => {
    const service = build(whisperEnv);
    runner.run.mockRejectedValueOnce(new Error('ffmpeg упал')); // ffmpeg (единственный вызов)

    await expect(service.transcribe(mp3Input)).rejects.toThrow('ffmpeg упал');

    expect(runner.run).toHaveBeenCalledTimes(1);
    expect(runner.run.mock.calls[0][0]).toBe('ffmpeg');
    expect(await readdir(tmpBase)).toEqual([]);
  });

  describe('Фаза 3 — устойчивость', () => {
    it('нет бинарника (WHISPER_BIN_PATH не существует) → ошибка про binary, раннер не вызван', async () => {
      const service = build({ ...whisperEnv, WHISPER_BIN_PATH: join(engineDir, 'nope-cli') });

      await expect(service.transcribe(wavInput)).rejects.toThrow(/binary/i);
      expect(runner.run).not.toHaveBeenCalled();
      expect(await readdir(tmpBase)).toEqual([]); // временный каталог не создавался
    });

    it('пустой WHISPER_BIN_PATH → ошибка про binary', async () => {
      const service = build({ ...whisperEnv, WHISPER_BIN_PATH: '' });

      await expect(service.transcribe(wavInput)).rejects.toThrow(/binary/i);
      expect(runner.run).not.toHaveBeenCalled();
    });

    it('нет модели (WHISPER_MODEL_PATH не существует) → ошибка про model, раннер не вызван', async () => {
      const service = build({ ...whisperEnv, WHISPER_MODEL_PATH: join(engineDir, 'nope.bin') });

      await expect(service.transcribe(wavInput)).rejects.toThrow(/model/i);
      expect(runner.run).not.toHaveBeenCalled();
    });

    it('ненулевой код whisper (раннер reject) → transcribe reject', async () => {
      const service = build(whisperEnv);
      runner.run.mockRejectedValueOnce(new Error('Команда «whisper-cli» завершилась с кодом 1'));

      await expect(service.transcribe(wavInput)).rejects.toThrow(/кодом 1/);
    });

    it('пустой/пробельный вывод whisper → ошибка про empty transcript', async () => {
      const service = build(whisperEnv);
      runner.run.mockResolvedValueOnce({ stdout: '   \n  \t', stderr: '', code: 0 });

      await expect(service.transcribe(wavInput)).rejects.toThrow(/empty/i);
      expect(await readdir(tmpBase)).toEqual([]);
    });

    it('превышен WHISPER_TIMEOUT_MS → ошибка про timeout; раннер получил opts.signal', async () => {
      const service = build({ ...whisperEnv, WHISPER_TIMEOUT_MS: '20' });
      runner.run.mockImplementation(
        (_cmd: string, _args: string[], opts?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            if (opts?.signal?.aborted) {
              reject(new Error('aborted'));
              return;
            }
            opts?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true,
            });
          }),
      );

      await expect(service.transcribe(wavInput)).rejects.toThrow(/timed out|timeout/i);

      const [, , opts] = runner.run.mock.calls[0] as [string, string[], { signal?: AbortSignal }];
      expect(opts?.signal).toBeInstanceOf(AbortSignal);
    });

    it('внешний input.signal уже aborted → transcribe reject, долгая работа не запускается', async () => {
      const service = build(whisperEnv);

      await expect(
        service.transcribe({ ...wavInput, signal: AbortSignal.abort() }),
      ).rejects.toThrow();
    });

    it('input.signal, прерванный во время работы → transcribe reject', async () => {
      const service = build(whisperEnv);
      const controller = new AbortController();
      runner.run.mockImplementation(
        (_cmd: string, _args: string[], opts?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            if (opts?.signal?.aborted) {
              reject(new Error('aborted'));
              return;
            }
            opts?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true,
            });
          }),
      );

      const promise = service.transcribe({ ...wavInput, signal: controller.signal });
      controller.abort();

      await expect(promise).rejects.toThrow();
      expect(await readdir(tmpBase)).toEqual([]);
    });
  });
});
