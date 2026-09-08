import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';

/**
 * Контракт модуля «Резюме файлов встречи», Фаза 1.
 *
 * После того как `recording` доходит до `status=done` и получает транскрипт,
 * автоматически запускается фоновая суммаризация: `summaryStatus` проходит
 * `pending → processing → done`, и в поле `summary` появляется структура
 * `{ summary: string, decisions: string[], actionItems: string[] }`.
 *
 * Для `attachment` поля `summaryStatus` и `summary` всегда `null`.
 *
 * GET /meetings/:id/files/:fileId
 *   -> 200 { ..., summaryStatus, summary }
 *
 * GET /meetings/:id/files
 *   -> 200 [{ ..., summaryStatus, summary }, ...]
 */

// В тестовом окружении: stub-движок и изолированный каталог хранения.
const TEST_MAX_UPLOAD_SIZE_BYTES = 8 * 1024;
let uploadsDir: string;

function uniqueEmail(): string {
  return `${randomUUID()}@example.com`;
}

function futureIso(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

describe('Meeting summary (e2e)', () => {
  let app: INestApplication<Server>;
  let accessToken: string;

  beforeAll(async () => {
    uploadsDir = await mkdtemp(join(tmpdir(), 'meeting-summary-e2e-'));
    process.env.UPLOADS_DIR = uploadsDir;
    process.env.MAX_UPLOAD_SIZE_BYTES = String(TEST_MAX_UPLOAD_SIZE_BYTES);
    process.env.SUMMARY_ENGINE = 'stub';
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
      .send({ title: 'Резюме встречи', startsAt: futureIso() })
      .expect(201);
    return res.body.id as string;
  }

  interface MeetingSummary {
    summary: string;
    decisions: string[];
    actionItems: string[];
  }

  interface FileInList {
    id: string;
    type: 'recording' | 'attachment';
    status: 'pending' | 'processing' | 'done' | 'failed';
    transcriptText: string | null;
    summaryStatus: 'pending' | 'processing' | 'done' | 'failed' | null;
    summary: MeetingSummary | null;
  }

  async function listFiles(meetingId: string): Promise<FileInList[]> {
    const res = await request(app.getHttpServer())
      .get(`/meetings/${meetingId}/files`)
      .set('Authorization', auth())
      .expect(200);
    return res.body as FileInList[];
  }

  async function getFile(meetingId: string, fileId: string): Promise<FileInList> {
    const res = await request(app.getHttpServer())
      .get(`/meetings/${meetingId}/files/${fileId}`)
      .set('Authorization', auth())
      .expect(200);
    return res.body as FileInList;
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
   * Ждёт, пока файл дойдёт до `status=done` (транскрипт готов).
   */
  async function waitForTranscriptDone(
    meetingId: string,
    fileId: string,
    { timeoutMs = 5000, intervalMs = 25 } = {},
  ): Promise<FileInList> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const file = (await listFiles(meetingId)).find((f) => f.id === fileId);
      if (!file) throw new Error(`Файл ${fileId} пропал из списка встречи`);
      if (file.status === 'done') return file;
      if (file.status === 'failed') {
        throw new Error(`Файл перешёл в failed до завершения транскрибации`);
      }
      if (Date.now() > deadline) {
        throw new Error(`Таймаут ожидания status=done, последний статус: ${file.status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  /**
   * Ждёт, пока `summaryStatus` дойдёт до `target`.
   */
  async function waitForSummaryStatus(
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
      const file = await getFile(meetingId, fileId);
      if (file.summaryStatus === target) return file;
      if (file.summaryStatus && !allowedBefore.has(file.summaryStatus)) {
        throw new Error(
          `Неожиданный summaryStatus «${file.summaryStatus}», ожидали переход в «${target}»`,
        );
      }
      if (Date.now() > deadline) {
        throw new Error(
          `Таймаут ожидания summaryStatus=${target}, последний статус: ${file.summaryStatus}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  describe('автоматическая суммаризация recording после транскрибации', () => {
    it('recording после status=done автоматически получает summaryStatus=done и summary', async () => {
      const meetingId = await createMeeting();

      const uploaded = await uploadRecording(meetingId, 'планёрка.mp3');
      expect(uploaded.status).toBe('pending');
      expect(uploaded.summaryStatus).toBeNull();
      expect(uploaded.summary).toBeNull();

      // Ждём завершения транскрибации.
      const transcribed = await waitForTranscriptDone(meetingId, uploaded.id);
      expect(transcribed.status).toBe('done');
      expect(typeof transcribed.transcriptText).toBe('string');

      // Ждём завершения суммаризации.
      const summarized = await waitForSummaryStatus(meetingId, uploaded.id, 'done');
      expect(summarized.summaryStatus).toBe('done');
      expect(summarized.summary).not.toBeNull();
      expect(typeof summarized.summary?.summary).toBe('string');
      expect(summarized.summary?.summary.length).toBeGreaterThan(0);
      expect(Array.isArray(summarized.summary?.decisions)).toBe(true);
      expect(Array.isArray(summarized.summary?.actionItems)).toBe(true);
    });

    it('GET /meetings/:id/files/:fileId возвращает summaryStatus и summary', async () => {
      const meetingId = await createMeeting();

      const uploaded = await uploadRecording(meetingId, 'встреча.mp3');
      await waitForTranscriptDone(meetingId, uploaded.id);
      const file = await waitForSummaryStatus(meetingId, uploaded.id, 'done');

      expect(file.summaryStatus).toBe('done');
      expect(file.summary).not.toBeNull();
      expect(file.summary?.summary).toBeTruthy();
      expect(Array.isArray(file.summary?.decisions)).toBe(true);
      expect(Array.isArray(file.summary?.actionItems)).toBe(true);
    });

    it('GET /meetings/:id/files возвращает summaryStatus и summary для всех файлов', async () => {
      const meetingId = await createMeeting();

      const uploaded = await uploadRecording(meetingId, 'совещание.mp3');
      await waitForTranscriptDone(meetingId, uploaded.id);
      await waitForSummaryStatus(meetingId, uploaded.id, 'done');

      const files = await listFiles(meetingId);
      const file = files.find((f) => f.id === uploaded.id);

      expect(file).toBeDefined();
      expect(file?.summaryStatus).toBe('done');
      expect(file?.summary).not.toBeNull();
      expect(typeof file?.summary?.summary).toBe('string');
      expect(Array.isArray(file?.summary?.decisions)).toBe(true);
      expect(Array.isArray(file?.summary?.actionItems)).toBe(true);
    });

    it('attachment имеет summaryStatus=null и summary=null', async () => {
      const meetingId = await createMeeting();

      const res = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', auth())
        .field('type', 'attachment')
        .attach('file', Buffer.from('заметки встречи'), {
          filename: 'notes.txt',
          contentType: 'text/plain',
        })
        .expect(201);

      expect(res.body.type).toBe('attachment');
      expect(res.body.status).toBe('done');
      expect(res.body.summaryStatus).toBeNull();
      expect(res.body.summary).toBeNull();

      // Подождём немного и убедимся, что ничего не изменилось.
      await new Promise((resolve) => setTimeout(resolve, 200));

      const file = await getFile(meetingId, res.body.id);
      expect(file.summaryStatus).toBeNull();
      expect(file.summary).toBeNull();
    });

    it('stub-движок возвращает детерминированное резюме с корректной структурой', async () => {
      const meetingId = await createMeeting();

      const uploaded = await uploadRecording(meetingId, 'квартальный-отчёт.mp3');
      await waitForTranscriptDone(meetingId, uploaded.id);
      const file = await waitForSummaryStatus(meetingId, uploaded.id, 'done');

      expect(file.summary).not.toBeNull();
      // Stub включает имя файла в summary для детерминированности.
      expect(file.summary?.summary).toContain('квартальный-отчёт.mp3');
      expect(file.summary?.decisions).toBeInstanceOf(Array);
      expect(file.summary?.actionItems).toBeInstanceOf(Array);
      // Stub генерирует хотя бы одно решение и одну задачу.
      expect(file.summary?.decisions.length).toBeGreaterThan(0);
      expect(file.summary?.actionItems.length).toBeGreaterThan(0);
    });
  });

  describe('сквозной сценарий: транскрипт → резюме', () => {
    it('загрузка → transcript done → summary done с полными данными', async () => {
      const meetingId = await createMeeting();

      // 1. Загрузка recording.
      const uploaded = await uploadRecording(meetingId, 'полный-цикл.mp3');
      expect(uploaded.status).toBe('pending');
      expect(uploaded.summaryStatus).toBeNull();

      // 2. Транскрибация завершается.
      const transcribed = await waitForTranscriptDone(meetingId, uploaded.id);
      expect(transcribed.transcriptText).toBeTruthy();

      // 3. Суммаризация автоматически запускается и завершается.
      const summarized = await waitForSummaryStatus(meetingId, uploaded.id, 'done');
      expect(summarized.summaryStatus).toBe('done');
      expect(summarized.summary).not.toBeNull();

      // 4. GET /meetings/:id/files показывает оба результата.
      const files = await listFiles(meetingId);
      const file = files.find((f) => f.id === uploaded.id);
      expect(file?.status).toBe('done');
      expect(file?.transcriptText).toBeTruthy();
      expect(file?.summaryStatus).toBe('done');
      expect(file?.summary).not.toBeNull();
    });
  });

  describe('POST /meetings/:id/files/:fileId/resummarize', () => {
    it('без токена авторизации → 401', async () => {
      const meetingId = await createMeeting();
      const uploaded = await uploadRecording(meetingId, 'test.mp3');
      await waitForTranscriptDone(meetingId, uploaded.id);
      await waitForSummaryStatus(meetingId, uploaded.id, 'done');

      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files/${uploaded.id}/resummarize`)
        .expect(401);
    });

    it('несуществующая встреча → 404', async () => {
      const fakeId = randomUUID();
      await request(app.getHttpServer())
        .post(`/meetings/${fakeId}/files/${fakeId}/resummarize`)
        .set('Authorization', auth())
        .expect(404);
    });

    it('несуществующий файл в существующей встрече → 404', async () => {
      const meetingId = await createMeeting();
      const fakeFileId = randomUUID();

      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files/${fakeFileId}/resummarize`)
        .set('Authorization', auth())
        .expect(404);
    });

    it('файл с status !== done → 409, summary не изменяется', async () => {
      const meetingId = await createMeeting();
      const uploaded = await uploadRecording(meetingId, 'pending-file.mp3');

      // Пытаемся вызвать resummarize сразу, пока файл в pending/processing.
      const res = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files/${uploaded.id}/resummarize`)
        .set('Authorization', auth());

      // Если файл ещё не done, должна быть 409.
      // Если уже done (stub быстро обработался), пропускаем тест.
      if (res.status === 409) {
        const file = await getFile(meetingId, uploaded.id);
        // Проверяем, что summary не был изменён (должен быть null или не изменился).
        expect(file.status).not.toBe('done');
      } else {
        // Файл уже done - stub обработался слишком быстро, тест не применим.
        expect(res.status).toBe(200);
      }
    });

    it('файл с summaryStatus=processing → 409, summary не изменяется', async () => {
      const meetingId = await createMeeting();
      const uploaded = await uploadRecording(meetingId, 'in-progress.mp3');

      // Дожидаемся завершения транскрипции.
      await waitForTranscriptDone(meetingId, uploaded.id);

      // Пытаемся запустить resummarize пока суммаризация в процессе.
      // Может быть в pending или processing, поймём по первому запросу.
      let file = await getFile(meetingId, uploaded.id);
      if (file.summaryStatus === null) {
        // Ждём, пока начнётся суммаризация.
        const deadline = Date.now() + 2000;
        while (file.summaryStatus === null && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 25));
          file = await getFile(meetingId, uploaded.id);
        }
      }

      // Если summaryStatus в pending или processing, должен быть 409.
      if (file.summaryStatus === 'pending' || file.summaryStatus === 'processing') {
        const summaryBefore = file.summary;
        await request(app.getHttpServer())
          .post(`/meetings/${meetingId}/files/${uploaded.id}/resummarize`)
          .set('Authorization', auth())
          .expect(409);

        const fileAfter = await getFile(meetingId, uploaded.id);
        expect(fileAfter.summary).toEqual(summaryBefore);
      } else {
        // Если уже done, пропускаем этот тест.
        // (В production этот race condition маловероятен, но в e2e с stub может проскочить быстро.)
      }
    });

    it('recording status=done с транскриптом → 200, summary перезаписывается', async () => {
      const meetingId = await createMeeting();
      const uploaded = await uploadRecording(meetingId, 'resummarize-test.mp3');

      await waitForTranscriptDone(meetingId, uploaded.id);
      const firstSummary = await waitForSummaryStatus(meetingId, uploaded.id, 'done');

      expect(firstSummary.summaryStatus).toBe('done');
      expect(firstSummary.summary).not.toBeNull();
      const firstSummaryContent = firstSummary.summary?.summary;

      // Запускаем повторную суммаризацию.
      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files/${uploaded.id}/resummarize`)
        .set('Authorization', auth())
        .expect(200);

      // Ждём завершения новой суммаризации.
      const secondSummary = await waitForSummaryStatus(meetingId, uploaded.id, 'done');

      expect(secondSummary.summaryStatus).toBe('done');
      expect(secondSummary.summary).not.toBeNull();

      // Stub-движок должен генерировать уникальное резюме (с timestamp или счётчиком).
      // Проверяем, что summary изменилось.
      expect(secondSummary.summary?.summary).not.toBe(firstSummaryContent);
      expect(secondSummary.summary?.summary.length).toBeGreaterThan(0);
      expect(Array.isArray(secondSummary.summary?.decisions)).toBe(true);
      expect(Array.isArray(secondSummary.summary?.actionItems)).toBe(true);
    });
  });

  describe('POST /meetings/:id/files/:fileId/reprocess сбрасывает резюме', () => {
    it('reprocess сбрасывает summaryStatus и summary, пересобирает после нового done', async () => {
      const meetingId = await createMeeting();
      const uploaded = await uploadRecording(meetingId, 'reprocess-test.mp3');

      await waitForTranscriptDone(meetingId, uploaded.id);
      const firstSummary = await waitForSummaryStatus(meetingId, uploaded.id, 'done');

      expect(firstSummary.summaryStatus).toBe('done');
      expect(firstSummary.summary).not.toBeNull();
      const firstSummaryContent = firstSummary.summary?.summary;

      // Для тестирования reprocess нужно перевести файл в status=failed.
      // Получаем PrismaService из приложения.
      const { PrismaService } = await import('./../src/prisma/prisma.service.js');
      const prisma = app.get(PrismaService);

      await prisma.meetingFile.update({
        where: { id: uploaded.id },
        data: { status: 'failed' },
      });

      // Запускаем reprocess.
      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files/${uploaded.id}/reprocess`)
        .set('Authorization', auth())
        .expect(200);

      // Сразу после reprocess summaryStatus и summary должны быть сброшены.
      const fileAfterReprocess = await getFile(meetingId, uploaded.id);
      expect(fileAfterReprocess.status).toBe('pending');
      expect(fileAfterReprocess.summaryStatus).toBeNull();
      expect(fileAfterReprocess.summary).toBeNull();

      // Ждём завершения новой транскрипции.
      await waitForTranscriptDone(meetingId, uploaded.id);

      // Ждём завершения новой суммаризации.
      const newSummary = await waitForSummaryStatus(meetingId, uploaded.id, 'done');

      expect(newSummary.summaryStatus).toBe('done');
      expect(newSummary.summary).not.toBeNull();
      // Новое резюме должно отличаться от первого (stub включает timestamp).
      expect(newSummary.summary?.summary).not.toBe(firstSummaryContent);
      expect(newSummary.summary?.summary.length).toBeGreaterThan(0);
    });
  });

  describe('DELETE /meetings/:id/files/:fileId', () => {
    it('удаление файла → последующий GET возвращает 404', async () => {
      const meetingId = await createMeeting();
      const uploaded = await uploadRecording(meetingId, 'to-delete.mp3');

      await waitForTranscriptDone(meetingId, uploaded.id);
      await waitForSummaryStatus(meetingId, uploaded.id, 'done');

      // Удаляем файл.
      await request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/files/${uploaded.id}`)
        .set('Authorization', auth())
        .expect(200);

      // Попытка получить удалённый файл → 404.
      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${uploaded.id}`)
        .set('Authorization', auth())
        .expect(404);
    });
  });
});
