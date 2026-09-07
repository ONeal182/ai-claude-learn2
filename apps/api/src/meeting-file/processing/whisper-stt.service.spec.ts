import { ConfigService } from '@nestjs/config';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStorageService } from '../../storage/file-storage.service.js';
import { type ProcessRunner } from './process-runner.js';
import { WhisperSttService } from './whisper-stt.service.js';
import { type SttInput } from './stt.service.js';

/**
 * `WhisperSttService`: сборка запуска whisper.cpp (Фаза 1) + конвертация не-WAV через ffmpeg
 * и очистка временного каталога (Фаза 2). `PROCESS_RUNNER` подменён `vi.fn()` — реальный
 * whisper.cpp/ffmpeg в unit-тестах не нужен. Ветки ошибок, таймаут и пустой вывод — Фаза 3.
 */
describe('WhisperSttService', () => {
  let runner: { run: ReturnType<typeof vi.fn> };
  let tmpBase: string;

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
  });

  afterEach(async () => {
    await rm(tmpBase, { recursive: true, force: true });
  });

  function makeConfig(values: Record<string, string>): ConfigService {
    return {
      get: (key: string, fallback?: unknown) =>
        values[key] ?? (key === 'WHISPER_TMP_DIR' ? tmpBase : (fallback ?? '')),
    } as unknown as ConfigService;
  }

  function build(values: Record<string, string>): WhisperSttService {
    runner = { run: vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '', code: 0 }) };
    return new WhisperSttService(runner as unknown as ProcessRunner, makeConfig(values), storage);
  }

  const whisperEnv = {
    WHISPER_BIN_PATH: '/opt/whisper/whisper-cli',
    WHISPER_MODEL_PATH: '/models/ggml-tiny.bin',
  };

  it('запускает WHISPER_BIN_PATH с -m <модель>, -l auto (пустой язык) и абсолютным путём файла', async () => {
    const service = build({ ...whisperEnv, WHISPER_LANGUAGE: '' });
    runner.run.mockResolvedValue({ stdout: 'привет', stderr: '', code: 0 });

    await service.transcribe(wavInput);

    expect(runner.run).toHaveBeenCalledTimes(1);
    const [command, args] = runner.run.mock.calls[0] as [string, string[]];
    expect(command).toBe('/opt/whisper/whisper-cli');
    expect(args).toEqual(expect.arrayContaining(['-m', '/models/ggml-tiny.bin']));
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
      expect(command).toBe('/opt/whisper/whisper-cli');
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
    expect(whisperCmd).toBe('/opt/whisper/whisper-cli');
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
});
