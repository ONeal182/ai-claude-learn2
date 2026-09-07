import { Logger } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateEnv } from './env.validation.js';

/**
 * `validateEnv` — валидатор для `ConfigModule.forRoot({ validate })`. При `STT_ENGINE=whisper`
 * требует существующие `WHISPER_BIN_PATH` / `WHISPER_MODEL_PATH`: в `production` — фатально
 * (`throw`), вне production — `Logger.warn` и старт продолжается. При `STT_ENGINE=stub` (и любом
 * другом не-whisper) проверок движка нет. Возвращает конфиг без изменений.
 */
describe('validateEnv', () => {
  let engineDir: string;
  let binPath: string;
  let modelPath: string;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    engineDir = await mkdtemp(join(tmpdir(), 'env-validation-spec-'));
    binPath = join(engineDir, 'whisper-cli');
    modelPath = join(engineDir, 'ggml-tiny.bin');
    await writeFile(binPath, '');
    await writeFile(modelPath, '');
    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    warnSpy.mockRestore();
    await rm(engineDir, { recursive: true, force: true });
  });

  it('STT_ENGINE=whisper без путей в production → бросает', () => {
    expect(() => validateEnv({ NODE_ENV: 'production', STT_ENGINE: 'whisper' })).toThrow(
      /WHISPER_BIN_PATH|WHISPER_MODEL_PATH/,
    );
  });

  it('STT_ENGINE=whisper без путей вне production → не бросает, только Logger.warn', () => {
    expect(() => validateEnv({ NODE_ENV: 'development', STT_ENGINE: 'whisper' })).not.toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toMatch(/WHISPER_BIN_PATH/);
  });

  it('STT_ENGINE=whisper: путь задан, но файла нет → тоже проблема', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        STT_ENGINE: 'whisper',
        WHISPER_BIN_PATH: join(engineDir, 'nope-cli'),
        WHISPER_MODEL_PATH: modelPath,
      }),
    ).toThrow(/WHISPER_BIN_PATH/);
  });

  it('STT_ENGINE=whisper с существующими бинарником и моделью → не бросает и не варнит', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        STT_ENGINE: 'whisper',
        WHISPER_BIN_PATH: binPath,
        WHISPER_MODEL_PATH: modelPath,
      }),
    ).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('STT_ENGINE=stub → проверок движка нет даже без путей', () => {
    expect(() => validateEnv({ NODE_ENV: 'production', STT_ENGINE: 'stub' })).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('STT_ENGINE не задан → трактуется как дефолт (whisper) → в production без путей бросает', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(/WHISPER_/);
  });

  it('возвращает переданный конфиг без изменений', () => {
    const config = { NODE_ENV: 'test', STT_ENGINE: 'stub', FOO: 'bar' };
    expect(validateEnv(config)).toEqual(config);
  });
});
