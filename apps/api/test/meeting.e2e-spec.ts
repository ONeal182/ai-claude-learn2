import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';

/**
 * Контракт модуля Meeting (пока не реализован — тесты специально красные, TDD).
 *
 * Все эндпоинты — под авторизацией: заголовок `Authorization: Bearer <accessToken>`.
 * Токен берётся из уже реализованного auth-модуля (POST /auth/register -> { accessToken }).
 * Без токена / с мусорным токеном любой эндпоинт отвечает 401.
 *
 * Форма встречи в ответах: { id: string, title: string, startsAt: string (ISO), createdAt: string (ISO) }.
 *
 * POST /meetings { title, startsAt }
 *   -> 201 <meeting>                     создаёт новую встречу, возвращает её с присвоенным id
 *   -> 400                               нет title / невалидная дата startsAt / пустое тело
 *   -> 401                               без токена
 *
 * GET /meetings
 *   -> 200 <meeting>[]                   список встреч (в т.ч. только что созданная)
 *   -> 401                               без токена
 *
 * GET /meetings/:id
 *   -> 200 <meeting>                     одна встреча по идентификатору
 *   -> 404                               встречи с таким id нет
 *   -> 401                               без токена
 */

function uniqueEmail(): string {
  return `${randomUUID()}@example.com`;
}

function futureIso(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

describe('Meeting (e2e)', () => {
  let app: INestApplication<Server>;
  let accessToken: string;

  beforeEach(async () => {
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

  async function createMeeting(
    overrides: Partial<{ title: string; startsAt: string }> = {},
  ): Promise<{ id: string; title: string; startsAt: string }> {
    const payload = { title: 'Weekly sync', startsAt: futureIso(), ...overrides };
    const res = await request(app.getHttpServer())
      .post('/meetings')
      .set('Authorization', auth())
      .send(payload)
      .expect(201);
    return res.body;
  }

  describe('POST /meetings', () => {
    it('создаёт встречу и возвращает её с присвоенным id', async () => {
      const title = 'Планёрка';
      const startsAt = futureIso();

      const res = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', auth())
        .send({ title, startsAt })
        .expect(201);

      expect(typeof res.body.id).toBe('string');
      expect(res.body.id.length).toBeGreaterThan(0);
      expect(res.body.title).toBe(title);
      expect(new Date(res.body.startsAt).toISOString()).toBe(startsAt);
    });

    it('возвращает 401 без токена', async () => {
      await request(app.getHttpServer())
        .post('/meetings')
        .send({ title: 'Планёрка', startsAt: futureIso() })
        .expect(401);
    });

    it('возвращает 401 с невалидным токеном', async () => {
      await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', 'Bearer not-a-real-jwt')
        .send({ title: 'Планёрка', startsAt: futureIso() })
        .expect(401);
    });

    it('возвращает 400 при отсутствии title', async () => {
      await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', auth())
        .send({ startsAt: futureIso() })
        .expect(400);
    });

    it('возвращает 400 при невалидной дате startsAt', async () => {
      await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', auth())
        .send({ title: 'Планёрка', startsAt: 'не-дата' })
        .expect(400);
    });

    it('возвращает 400 при пустом теле', async () => {
      await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', auth())
        .send({})
        .expect(400);
    });
  });

  describe('GET /meetings', () => {
    it('возвращает список встреч, включая только что созданную', async () => {
      const created = await createMeeting({ title: 'В списке' });

      const res = await request(app.getHttpServer())
        .get('/meetings')
        .set('Authorization', auth())
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const ids = (res.body as Array<{ id: string }>).map((m) => m.id);
      expect(ids).toContain(created.id);
    });

    it('возвращает 401 без токена', async () => {
      await request(app.getHttpServer()).get('/meetings').expect(401);
    });
  });

  describe('GET /meetings/:id', () => {
    it('возвращает одну встречу по идентификатору', async () => {
      const created = await createMeeting({ title: 'По id' });

      const res = await request(app.getHttpServer())
        .get(`/meetings/${created.id}`)
        .set('Authorization', auth())
        .expect(200);

      expect(res.body.id).toBe(created.id);
      expect(res.body.title).toBe('По id');
    });

    it('возвращает 404 при отсутствии встречи', async () => {
      // создаём встречу — так убеждаемся, что ресурс /meetings существует
      // и 404 ниже именно «встреча не найдена», а не «нет такого маршрута»
      const created = await createMeeting();

      await request(app.getHttpServer())
        .get(`/meetings/${randomUUID()}`)
        .set('Authorization', auth())
        .expect(404);

      await request(app.getHttpServer())
        .get(`/meetings/${created.id}`)
        .set('Authorization', auth())
        .expect(200);
    });

    it('возвращает 401 без токена', async () => {
      const created = await createMeeting();

      await request(app.getHttpServer()).get(`/meetings/${created.id}`).expect(401);
    });
  });
});
