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

  interface FileInList {
    id: string;
    type: 'recording' | 'attachment';
    status: 'pending' | 'processing' | 'done' | 'failed';
    transcriptText: string | null;
  }

  async function listFiles(meetingId: string): Promise<FileInList[]> {
    const res = await request(app.getHttpServer())
      .get(`/meetings/${meetingId}/files`)
      .set('Authorization', auth())
      .expect(200);
    return res.body as FileInList[];
  }

  async function uploadRecording(meetingId: string, filename: string): Promise<FileInList> {
    const res = await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/files`)
      .set('Authorization', auth())
      .field('type', 'recording')
      .attach('file', Buffer.from('фейковые байты аудио'), { filename, contentType: 'audio/mpeg' })
      .expect(201);
    return res.body as FileInList;
  }

  /**
   * Ждёт, пока фоновый воркер доведёт файл до `target`. Обработка стартует сама после загрузки —
   * это наблюдение, а не «дополнительный вызов». До `target` допустимы только промежуточные статусы.
   */
  async function waitForStatus(
    meetingId: string,
    fileId: string,
    target: 'done' | 'failed',
    { timeoutMs = 5000, intervalMs = 25 } = {},
  ): Promise<FileInList> {
    const allowedBefore = new Set(
      target === 'done' ? ['pending', 'processing', 'done'] : ['pending', 'processing', 'failed'],
    );
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const file = (await listFiles(meetingId)).find((f) => f.id === fileId);
      if (!file) throw new Error(`Файл ${fileId} пропал из списка встречи`);
      if (file.status === target) return file;
      if (!allowedBefore.has(file.status)) {
        throw new Error(`Неожиданный статус «${file.status}», ожидали переход в «${target}»`);
      }
      if (Date.now() > deadline) {
        throw new Error(`Таймаут ожидания «${target}», последний статус: «${file.status}»`);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
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
        .responseType('blob')
        .expect(200);

      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain(
        `filename*=UTF-8''${encodeURIComponent('отчёт.txt')}`,
      );
      // ASCII-фолбэк строится из настоящего имени и сохраняет расширение (не буквальное "file")
      expect(res.headers['content-disposition']).toMatch(/filename="[^"]*\.txt"/);
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

  // ── Фаза 2: фоновая обработка записи и транскрипт ─────────────────────────────
  //
  // recording после загрузки сам обрабатывается in-process воркером: pending → processing → done,
  // по завершении в ответе списка появляется transcriptText. Заглушка STT детерминированная:
  // транскрипт выводится из метаданных файла; если в имени есть маркер `__stt_fail__` — падает
  // (нужно для проверки reprocess). attachment не обрабатывается.
  //
  // POST /meetings/:id/files/:fileId/reprocess
  //   -> 200 <file>   только для статуса `failed`: сбрасывает в pending и перезапускает воркер
  //   -> 409          для любого другого статуса
  //   -> 404          файла нет / не принадлежит встрече
  //   -> 401          без токена

  describe('фоновая обработка recording', () => {
    it('recording сам проходит pending → done и получает транскрипт без доп. вызова', async () => {
      const meetingId = await createMeeting();

      const uploaded = await uploadRecording(meetingId, 'планёрка.mp3');
      expect(uploaded.status).toBe('pending');
      expect(uploaded.transcriptText).toBeNull();

      const done = await waitForStatus(meetingId, uploaded.id, 'done');
      expect(done.status).toBe('done');
      expect(typeof done.transcriptText).toBe('string');
      expect(done.transcriptText).toContain('планёрка.mp3');
    });

    it('attachment не обрабатывается: остаётся done без транскрипта', async () => {
      const meetingId = await createMeeting();

      const res = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', auth())
        .field('type', 'attachment')
        .attach('file', Buffer.from('вложение'), {
          filename: 'notes.txt',
          contentType: 'text/plain',
        })
        .expect(201);
      expect(res.body.status).toBe('done');

      await new Promise((resolve) => setTimeout(resolve, 150));
      const file = (await listFiles(meetingId)).find((f) => f.id === res.body.id);
      expect(file?.status).toBe('done');
      expect(file?.transcriptText).toBeNull();
    });

    it('recording с маркером сбоя в имени уходит в failed без транскрипта', async () => {
      const meetingId = await createMeeting();

      const uploaded = await uploadRecording(meetingId, 'битая-запись__stt_fail__.mp3');
      const failed = await waitForStatus(meetingId, uploaded.id, 'failed');
      expect(failed.status).toBe('failed');
      expect(failed.transcriptText).toBeNull();
    });

    it('DELETE обработанной recording удаляет запись вместе с транскриптом', async () => {
      const meetingId = await createMeeting();

      const uploaded = await uploadRecording(meetingId, 'к-удалению.mp3');
      const done = await waitForStatus(meetingId, uploaded.id, 'done');
      expect(done.transcriptText).toBeTruthy();

      await request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/files/${uploaded.id}`)
        .set('Authorization', auth())
        .expect((r) => {
          if (![200, 204].includes(r.status)) {
            throw new Error(`ожидался 200/204, получен ${r.status}`);
          }
        });

      expect((await listFiles(meetingId)).find((f) => f.id === uploaded.id)).toBeUndefined();
    });
  });

  describe('POST /meetings/:id/files/:fileId/reprocess', () => {
    it('перезапускает файл в статусе failed: сбрасывает в pending и снова прогоняет воркер', async () => {
      const meetingId = await createMeeting();

      const uploaded = await uploadRecording(meetingId, 'снова-упадёт__stt_fail__.mp3');
      await waitForStatus(meetingId, uploaded.id, 'failed');

      const res = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files/${uploaded.id}/reprocess`)
        .set('Authorization', auth())
        .expect(200);
      expect(res.body.status).toBe('pending');
      expect(res.body.transcriptText).toBeNull();

      // маркер в имени сохранился — воркер снова доведёт до failed (доказывает перезапуск)
      const failedAgain = await waitForStatus(meetingId, uploaded.id, 'failed');
      expect(failedAgain.status).toBe('failed');
    });

    it('возвращает 409 для recording в статусе done', async () => {
      const meetingId = await createMeeting();

      const uploaded = await uploadRecording(meetingId, 'уже-готова.mp3');
      await waitForStatus(meetingId, uploaded.id, 'done');

      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files/${uploaded.id}/reprocess`)
        .set('Authorization', auth())
        .expect(409);
    });

    it('возвращает 409 для attachment (не обрабатывается)', async () => {
      const meetingId = await createMeeting();

      const upload = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', auth())
        .field('type', 'attachment')
        .attach('file', Buffer.from('x'), { filename: 'a.txt', contentType: 'text/plain' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files/${upload.body.id}/reprocess`)
        .set('Authorization', auth())
        .expect(409);
    });

    it('возвращает 404 для несуществующего файла', async () => {
      const meetingId = await createMeeting();
      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files/${randomUUID()}/reprocess`)
        .set('Authorization', auth())
        .expect(404);
    });

    it('возвращает 401 без токена', async () => {
      const meetingId = await createMeeting();
      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files/${randomUUID()}/reprocess`)
        .expect(401);
    });
  });
});
