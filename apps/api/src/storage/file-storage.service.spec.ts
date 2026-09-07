import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { buffer } from 'node:stream/consumers';
import { setTimeout as delay } from 'node:timers/promises';
import { FileStorageService } from './file-storage.service.js';

/**
 * Контракт переиспользуемого хранилища (Issue #37): save / exists / createReadStream / remove
 * поверх плоской раскладки в `UPLOADS_DIR`, ключ задаёт вызывающая сторона (обычно `randomUUID`).
 * Тот же API использует и `meeting-file`, и `profile` (аватары).
 */
describe('FileStorageService', () => {
  let baseDir: string;
  let storage: FileStorageService;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'file-storage-spec-'));
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [FileStorageService, { provide: ConfigService, useValue: { get: () => baseDir } }],
    }).compile();
    storage = moduleRef.get(FileStorageService);
    await storage.onModuleInit();
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  function readAll(key: string): Promise<Buffer> {
    return buffer(storage.createReadStream(key));
  }

  it('save → exists → createReadStream отдаёт те же байты', async () => {
    const key = randomUUID();
    const bytes = Buffer.from('аватар-байты', 'utf8');

    await storage.save(key, bytes);

    expect(await storage.exists(key)).toBe(true);
    expect((await readAll(key)).equals(bytes)).toBe(true);
  });

  it('exists → false для неизвестного ключа', async () => {
    expect(await storage.exists(randomUUID())).toBe(false);
  });

  it('remove удаляет бинарник, повторный remove не бросает', async () => {
    const key = randomUUID();
    await storage.save(key, Buffer.from('x'));

    await storage.remove(key);
    expect(await storage.exists(key)).toBe(false);

    await expect(storage.remove(key)).resolves.toBeUndefined();
  });

  it('save по существующему ключу перезаписывает содержимое', async () => {
    const key = randomUUID();
    await storage.save(key, Buffer.from('старое'));
    await delay(1);
    await storage.save(key, Buffer.from('новое', 'utf8'));

    expect((await readAll(key)).toString('utf8')).toBe('новое');
  });

  // absolutePath — для потребителей, которым нужен путь на диске (STT-движок отдаёт файл
  // внешнему процессу). Барьер: ключ должен быть одиночным сегментом (как `randomUUID`).
  describe('absolutePath', () => {
    it('валидный ключ → абсолютный путь внутри baseDir', () => {
      const key = randomUUID();

      expect(storage.absolutePath(key)).toBe(join(baseDir, key));
    });

    it.each([
      ['пустой ключ', ''],
      ['родительский каталог', '..'],
      ['обход вверх', `..${sep}..${sep}etc${sep}passwd`],
      ['вложенный путь', `sub${sep}file`],
      ['слэш', 'a/b'],
      ['обратный слэш', 'a\\b'],
      ['абсолютный путь', `${sep}etc${sep}passwd`],
    ])('отклоняет %s', (_label, key) => {
      expect(() => storage.absolutePath(key)).toThrow(BadRequestException);
    });
  });
});
