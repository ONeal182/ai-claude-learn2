import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';

/**
 * Разграничение доступа к встречам и их файлам между пользователями (модель владения).
 *
 * Встреча принадлежит создателю (`ownerId`). Для чужого пользователя она и её файлы
 * неотличимы от несуществующих — любой доступ отвечает 404 (не 403 — не палим наличие ресурса),
 * список встреч содержит только свои. Без токена — 401.
 */
function uniqueEmail(): string {
  return `${randomUUID()}@example.com`;
}

function futureIso(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

describe('Meeting ownership (e2e)', () => {
  let app: INestApplication<Server>;
  let uploadsDir: string;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    uploadsDir = await mkdtemp(join(tmpdir(), 'meeting-ownership-e2e-'));
    process.env.UPLOADS_DIR = uploadsDir;
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

    const register = async (): Promise<string> => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: uniqueEmail(), password: 'correct-horse-battery-staple' })
        .expect(201);
      return res.body.accessToken as string;
    };

    tokenA = await register();
    tokenB = await register();
  });

  afterEach(async () => {
    await app.close();
  });

  async function createMeetingAs(token: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/meetings')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Приватная встреча', startsAt: futureIso() })
      .expect(201);
    return res.body.id as string;
  }

  it('GET /meetings отдаёт только свои встречи', async () => {
    const meetingA = await createMeetingAs(tokenA);
    await createMeetingAs(tokenB);

    const res = await request(app.getHttpServer())
      .get('/meetings')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    const ids = (res.body as Array<{ id: string }>).map((m) => m.id);
    expect(ids).not.toContain(meetingA);
    expect(ids).toHaveLength(1);
  });

  it('GET /meetings/:id чужой встречи → 404', async () => {
    const meetingA = await createMeetingAs(tokenA);

    await request(app.getHttpServer())
      .get(`/meetings/${meetingA}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);

    // владелец всё ещё видит её
    await request(app.getHttpServer())
      .get(`/meetings/${meetingA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
  });

  it('файлы чужой встречи недоступны на запись и чтение → 404', async () => {
    const meetingA = await createMeetingAs(tokenA);

    const uploaded = await request(app.getHttpServer())
      .post(`/meetings/${meetingA}/files`)
      .set('Authorization', `Bearer ${tokenA}`)
      .field('type', 'attachment')
      .attach('file', Buffer.from('секретные заметки'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    const fileId = uploaded.body.id as string;

    const asB = `Bearer ${tokenB}`;
    await request(app.getHttpServer())
      .get(`/meetings/${meetingA}/files`)
      .set('Authorization', asB)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/meetings/${meetingA}/files/${fileId}/content`)
      .set('Authorization', asB)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/meetings/${meetingA}/files/${fileId}`)
      .set('Authorization', asB)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/meetings/${meetingA}/files`)
      .set('Authorization', asB)
      .field('type', 'attachment')
      .attach('file', Buffer.from('чужой файл'), { filename: 'x.txt', contentType: 'text/plain' })
      .expect(404);

    // файл на месте у владельца
    await request(app.getHttpServer())
      .get(`/meetings/${meetingA}/files/${fileId}/content`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
  });

  it('без токена — 401', async () => {
    const meetingA = await createMeetingAs(tokenA);
    await request(app.getHttpServer()).get(`/meetings/${meetingA}`).expect(401);
  });
});
