import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';

/**
 * Контракт модуля «Файлы встречи», Фаза 1 (пока не реализован — тесты специально красные, TDD).
 *
 * Все эндпоинты — под авторизацией (`Authorization: Bearer <accessToken>`), как `/meetings`.
 * Токен берётся из auth-модуля (POST /auth/register -> { accessToken }).
 *
 * Форма файла в ответах:
 *   { id, meetingId, type: 'recording'|'attachment', status: 'pending'|'processing'|'done'|'failed',
 *     originalName, mimeType, size, transcriptText: string|null, createdAt, updatedAt }
 *
 * POST /meetings/:id/files            multipart (поле `file` + поле `type`)
 *   -> 201 <file>                     `attachment` -> status `done`; `recording` -> status `pending`
 *   -> 400                            mime не из белого списка
 *   -> 401                            без токена
 *   -> 413                            тело больше лимита
 *   -> 404                            встречи с таким id нет
 *
 * GET /meetings/:id/files
 *   -> 200 <file>[]                   список файлов встречи
 *   -> 401                            без токена
 *
 * GET /meetings/:id/files/:fileId/content
 *   -> 200 <binary>                   исходный файл; Content-Type = mime, Content-Disposition = attachment + имя
 *   -> 404                            файла нет / не принадлежит встрече
 *   -> 401                            без токена
 *
 * DELETE /meetings/:id/files/:fileId
 *   -> 200/204                        удаляет запись и бинарник
 *   -> 404                            повторное удаление
 *   -> 401                            без токена
 */

// В тестовом окружении: изолированный каталог хранения и маленький лимит, чтобы дёшево проверить 413.
const TEST_MAX_UPLOAD_SIZE_BYTES = 8 * 1024;
let uploadsDir: string;

function uniqueEmail(): string {
  return `${randomUUID()}@example.com`;
}

function futureIso(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

describe('Meeting files (e2e)', () => {
  let app: INestApplication<Server>;
  let accessToken: string;

  beforeAll(async () => {
    uploadsDir = await mkdtemp(join(tmpdir(), 'meeting-files-e2e-'));
    process.env.UPLOADS_DIR = uploadsDir;
    process.env.MAX_UPLOAD_SIZE_BYTES = String(TEST_MAX_UPLOAD_SIZE_BYTES);
  });

  afterAll(async () => {
    await rm(uploadsDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
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

  async function createMeeting(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/meetings')
      .set('Authorization', auth())
      .send({ title: 'Файлы встречи', startsAt: futureIso() })
      .expect(201);
    return res.body.id as string;
  }

  describe('POST /meetings/:id/files', () => {
    it('загружает вложение: тип attachment, статус done, метаданные', async () => {
      const meetingId = await createMeeting();
      const body = Buffer.from('привет из вложения', 'utf8');

      const res = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', auth())
        .field('type', 'attachment')
        .attach('file', body, { filename: 'заметки.txt', contentType: 'text/plain' })
        .expect(201);

      expect(typeof res.body.id).toBe('string');
      expect(res.body.meetingId).toBe(meetingId);
      expect(res.body.type).toBe('attachment');
      expect(res.body.status).toBe('done');
      expect(res.body.originalName).toBe('заметки.txt');
      expect(res.body.mimeType).toBe('text/plain');
      expect(res.body.size).toBe(body.length);
      expect(res.body.transcriptText).toBeNull();
    });

    it('загружает запись: тип recording, статус pending', async () => {
      const meetingId = await createMeeting();
      const body = Buffer.from('фейковые байты аудио');

      const res = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', auth())
        .field('type', 'recording')
        .attach('file', body, { filename: 'call.mp3', contentType: 'audio/mpeg' })
        .expect(201);

      expect(res.body.type).toBe('recording');
      expect(res.body.status).toBe('pending');
      expect(res.body.mimeType).toBe('audio/mpeg');
      expect(res.body.size).toBe(body.length);
    });

    it('возвращает 401 без токена', async () => {
      const meetingId = await createMeeting();

      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .field('type', 'attachment')
        .attach('file', Buffer.from('x'), { filename: 'a.txt', contentType: 'text/plain' })
        .expect(401);
    });

    it('возвращает 413 при превышении лимита размера', async () => {
      const meetingId = await createMeeting();
      const tooBig = Buffer.alloc(TEST_MAX_UPLOAD_SIZE_BYTES + 1024, 1);

      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', auth())
        .field('type', 'recording')
        .attach('file', tooBig, { filename: 'big.mp3', contentType: 'audio/mpeg' })
        .expect(413);
    });

    it('возвращает 400 при mime не из белого списка', async () => {
      const meetingId = await createMeeting();

      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', auth())
        .field('type', 'attachment')
        .attach('file', Buffer.from('MZ'), {
          filename: 'evil.exe',
          contentType: 'application/x-msdownload',
        })
        .expect(400);
    });

    it('возвращает 404 для несуществующей встречи', async () => {
      await request(app.getHttpServer())
        .post(`/meetings/${randomUUID()}/files`)
        .set('Authorization', auth())
        .field('type', 'attachment')
        .attach('file', Buffer.from('x'), { filename: 'a.txt', contentType: 'text/plain' })
        .expect(404);
    });
  });

  describe('GET /meetings/:id/files', () => {
    it('возвращает список файлов встречи с типом, статусом и метаданными', async () => {
      const meetingId = await createMeeting();
      const upload = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', auth())
        .field('type', 'attachment')
        .attach('file', Buffer.from('в списке'), {
          filename: 'list.txt',
          contentType: 'text/plain',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files`)
        .set('Authorization', auth())
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const found = (res.body as Array<{ id: string }>).find((f) => f.id === upload.body.id);
      expect(found).toBeDefined();
      expect(found).toMatchObject({
        type: 'attachment',
        status: 'done',
        originalName: 'list.txt',
        mimeType: 'text/plain',
      });
    });

    it('возвращает 401 без токена', async () => {
      const meetingId = await createMeeting();
      await request(app.getHttpServer()).get(`/meetings/${meetingId}/files`).expect(401);
    });
  });

  describe('GET /meetings/:id/files/:fileId/content', () => {
    it('отдаёт файл с корректными Content-Type и Content-Disposition', async () => {
      const meetingId = await createMeeting();
      const body = Buffer.from('содержимое для скачивания', 'utf8');
      const upload = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', auth())
        .field('type', 'attachment')
        .attach('file', body, { filename: 'отчёт.txt', contentType: 'text/plain' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${upload.body.id}/content`)
        .set('Authorization', auth())
        .buffer(true)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain(
        `filename*=UTF-8''${encodeURIComponent('отчёт.txt')}`,
      );
      expect(Buffer.from(res.body).equals(body)).toBe(true);
    });

    it('возвращает 404 для чужого / несуществующего файла', async () => {
      const meetingId = await createMeeting();
      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${randomUUID()}/content`)
        .set('Authorization', auth())
        .expect(404);
    });

    it('возвращает 401 без токена', async () => {
      const meetingId = await createMeeting();
      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${randomUUID()}/content`)
        .expect(401);
    });
  });

  describe('DELETE /meetings/:id/files/:fileId', () => {
    it('удаляет файл; повторное удаление возвращает 404', async () => {
      const meetingId = await createMeeting();
      const upload = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', auth())
        .field('type', 'attachment')
        .attach('file', Buffer.from('удалить меня'), {
          filename: 'del.txt',
          contentType: 'text/plain',
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/files/${upload.body.id}`)
        .set('Authorization', auth())
        .expect((r) => {
          if (![200, 204].includes(r.status)) {
            throw new Error(`ожидался 200/204, получен ${r.status}`);
          }
        });

      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${upload.body.id}/content`)
        .set('Authorization', auth())
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/files/${upload.body.id}`)
        .set('Authorization', auth())
        .expect(404);
    });

    it('возвращает 401 без токена', async () => {
      const meetingId = await createMeeting();
      await request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/files/${randomUUID()}`)
        .expect(401);
    });
  });
});
