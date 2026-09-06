import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';

/**
 * Контракт загрузки и отдачи аватара (Фаза 3) — реализации ещё нет, тесты специально красные (TDD).
 *
 * PUT /users/me/avatar   multipart (поле `file`), контроллер под @UseGuards(JwtAuthGuard)
 *   -> 200 { ...profile, avatarUrl: '/users/avatars/<key>' }   image/jpeg|image/png|image/webp ≤ лимита
 *   -> 401   без токена
 *   -> 413   тело больше лимита (аватар не меняется)
 *   -> 400   mime не из белого списка image/* (аватар не меняется)
 *
 * GET /users/avatars/:key   публичный (AvatarController без JwtAuthGuard)
 *   -> 200 <binary>   Content-Type = сохранённый mime загруженного файла
 *   -> 404            ключ неизвестен либо бинарника нет на диске
 *
 * Замена: повторный PUT выдаёт новый avatarUrl (новый файл), прежний URL → 404, старый файл стёрт с диска.
 * GET /users/me всегда отражает актуальный avatarUrl.
 *
 * По образцу meeting-files.e2e-spec.ts: изолированный UPLOADS_DIR во временном каталоге и маленький
 * MAX_UPLOAD_SIZE_BYTES — чтобы дёшево проверить 413 и не мусорить в рабочем uploads/.
 */

const TEST_MAX_UPLOAD_SIZE_BYTES = 8 * 1024;
let uploadsDir: string;

// Содержимое не парсится сервером (Content-Type берётся у клиента) — важен только round-trip байтов.
const PNG_BYTES = Buffer.from('фейковые байты PNG-аватара', 'utf8');
const JPEG_BYTES = Buffer.from('фейковые байты JPEG-аватара', 'utf8');
const WEBP_BYTES = Buffer.from('фейковые байты WEBP-аватара', 'utf8');

function uniqueEmail(): string {
  return `${randomUUID()}@example.com`;
}

describe('Profile avatar (e2e)', () => {
  let app: INestApplication<Server>;
  let accessToken: string;

  beforeAll(async () => {
    uploadsDir = await mkdtemp(join(tmpdir(), 'profile-avatar-e2e-'));
    process.env.UPLOADS_DIR = uploadsDir;
    process.env.MAX_UPLOAD_SIZE_BYTES = String(TEST_MAX_UPLOAD_SIZE_BYTES);
  });

  afterAll(async () => {
    await rm(uploadsDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Динамический import после подмены env — @nestjs/config не перетирает уже заданные process.env.
    const { AppModule } = await import('./../src/app.module.js');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: uniqueEmail(), password: 'correct-horse-battery-staple' })
      .expect(201);
    accessToken = res.body.accessToken as string;
  });

  afterEach(async () => {
    await app.close();
  });

  const auth = () => `Bearer ${accessToken}`;

  async function getAvatarUrl(): Promise<string | null> {
    const res = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', auth())
      .expect(200);
    return res.body.avatarUrl as string | null;
  }

  function putAvatar(bytes: Buffer, contentType: string, filename: string) {
    return request(app.getHttpServer())
      .put('/users/me/avatar')
      .set('Authorization', auth())
      .attach('file', bytes, { filename, contentType });
  }

  describe('PUT /users/me/avatar', () => {
    it('возвращает 401 без токена', async () => {
      await request(app.getHttpServer())
        .put('/users/me/avatar')
        .attach('file', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' })
        .expect(401);
    });

    it('принимает png ≤ лимита: 200 + avatarUrl, файл отдаётся, GET /users/me совпадает', async () => {
      const res = await putAvatar(PNG_BYTES, 'image/png', 'me.png').expect(200);

      const avatarUrl = res.body.avatarUrl as string;
      expect(avatarUrl).toMatch(/^\/users\/avatars\/.+/);
      expect(typeof res.body.email).toBe('string');

      const download = await request(app.getHttpServer())
        .get(avatarUrl)
        .responseType('blob')
        .expect(200);
      expect(download.headers['content-type']).toContain('image/png');
      expect(Buffer.from(download.body).equals(PNG_BYTES)).toBe(true);

      expect(await getAvatarUrl()).toBe(avatarUrl);
    });

    it('возвращает 413 при превышении лимита размера, аватар не меняется', async () => {
      const tooBig = Buffer.alloc(TEST_MAX_UPLOAD_SIZE_BYTES + 1024, 1);

      // у нового пользователя аватара нет — отказ ничего не создаёт
      await putAvatar(tooBig, 'image/png', 'big.png').expect(413);
      expect(await getAvatarUrl()).toBeNull();

      // при уже загруженном аватаре отказ не затирает прежний файл
      const before = await putAvatar(JPEG_BYTES, 'image/jpeg', 'ok.jpg').expect(200);
      const avatarUrl = before.body.avatarUrl as string;

      await putAvatar(tooBig, 'image/png', 'big.png').expect(413);

      expect(await getAvatarUrl()).toBe(avatarUrl);
      const still = await request(app.getHttpServer())
        .get(avatarUrl)
        .responseType('blob')
        .expect(200);
      expect(still.headers['content-type']).toContain('image/jpeg');
      expect(Buffer.from(still.body).equals(JPEG_BYTES)).toBe(true);
    });

    it('возвращает 400 для не-image mime, аватар не меняется', async () => {
      const ok = await putAvatar(PNG_BYTES, 'image/png', 'me.png').expect(200);
      const avatarUrl = ok.body.avatarUrl as string;

      await putAvatar(Buffer.from('%PDF-1.4 fake'), 'application/pdf', 'doc.pdf').expect(400);

      expect(await getAvatarUrl()).toBe(avatarUrl);
      const still = await request(app.getHttpServer())
        .get(avatarUrl)
        .responseType('blob')
        .expect(200);
      expect(still.headers['content-type']).toContain('image/png');
      expect(Buffer.from(still.body).equals(PNG_BYTES)).toBe(true);
    });

    it('повторная загрузка заменяет файл: новый avatarUrl, прежний URL → 404, старый файл стёрт', async () => {
      const first = await putAvatar(PNG_BYTES, 'image/png', 'one.png').expect(200);
      const firstUrl = first.body.avatarUrl as string;
      const firstKey = firstUrl.split('/').pop() as string;
      await request(app.getHttpServer()).get(firstUrl).expect(200);
      await expect(stat(join(uploadsDir, firstKey))).resolves.toBeDefined();

      const second = await putAvatar(WEBP_BYTES, 'image/webp', 'two.webp').expect(200);
      const secondUrl = second.body.avatarUrl as string;
      expect(secondUrl).not.toBe(firstUrl);

      const download = await request(app.getHttpServer())
        .get(secondUrl)
        .responseType('blob')
        .expect(200);
      expect(download.headers['content-type']).toContain('image/webp');
      expect(Buffer.from(download.body).equals(WEBP_BYTES)).toBe(true);

      await request(app.getHttpServer()).get(firstUrl).expect(404);
      await expect(stat(join(uploadsDir, firstKey))).rejects.toThrow();
      expect(await getAvatarUrl()).toBe(secondUrl);
    });
  });

  describe('GET /users/avatars/:key', () => {
    it('возвращает 404 для неизвестного ключа', async () => {
      await request(app.getHttpServer()).get(`/users/avatars/${randomUUID()}`).expect(404);
    });
  });
});
