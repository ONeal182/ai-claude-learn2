import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';

/**
 * Контракт (пока не реализован — тесты специально красные, TDD):
 *
 * POST /auth/register { email, password }
 *   -> 201 { accessToken }               создаёт пользователя
 *   -> 400                               невалидный email / короткий пароль / отсутствуют поля
 *   -> 409                               email уже зарегистрирован
 *
 * POST /auth/login { email, password }
 *   -> 200 { accessToken }               пользователь уже существует, пароль верный
 *   -> 400                               невалидный email / отсутствуют поля
 *   -> 401                               пользователь не найден ИЛИ пароль неверный
 *                                        (одинаковое сообщение — чтобы не палить, есть ли email в базе)
 *
 * accessToken — JWT: три base64url-сегмента, payload содержит email зарегистрированного/найденного пользователя.
 */

const MIN_PASSWORD_LENGTH = 8;

function uniqueEmail(): string {
  return `${randomUUID()}@example.com`;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  expect(parts).toHaveLength(3);
  const [, payload] = parts;
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
}

describe('Auth (e2e)', () => {
  let app: INestApplication<Server>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Валидация (400 на невалидный email/пароль) — ответственность реализации
    // (например, APP_PIPE в AuthModule), а не тестового bootstrap.
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('создаёт пользователя и возвращает JWT', async () => {
      const email = uniqueEmail();
      const password = 'correct-horse-battery-staple';

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.password).toBeUndefined();

      const payload = decodeJwtPayload(res.body.accessToken);
      expect(payload.email).toBe(email);
    });

    it('позволяет затем залогиниться с теми же данными', async () => {
      const email = uniqueEmail();
      const password = 'correct-horse-battery-staple';

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      expect(typeof res.body.accessToken).toBe('string');
    });

    it('возвращает 409 при повторной регистрации того же email', async () => {
      const email = uniqueEmail();
      const password = 'correct-horse-battery-staple';

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'another-valid-password' })
        .expect(409);
    });

    it('возвращает 400 при невалидном email', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'correct-horse-battery-staple' })
        .expect(400);
    });

    it('возвращает 400 при слишком коротком пароле', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: uniqueEmail(),
          password: 'a'.repeat(MIN_PASSWORD_LENGTH - 1),
        })
        .expect(400);
    });

    it('возвращает 400 при отсутствующих полях', async () => {
      await request(app.getHttpServer()).post('/auth/register').send({}).expect(400);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: uniqueEmail() })
        .expect(400);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ password: 'correct-horse-battery-staple' })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('не создаёт пользователя — 401 для незарегистрированного email', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: uniqueEmail(), password: 'correct-horse-battery-staple' })
        .expect(401);
    });

    it('возвращает 401 при неверном пароле для существующего пользователя', async () => {
      const email = uniqueEmail();

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'correct-horse-battery-staple' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'wrong-password' })
        .expect(401);
    });

    it('повторный логин не создаёт второго пользователя (register после login тем же email — 409)', async () => {
      const email = uniqueEmail();
      const password = 'correct-horse-battery-staple';

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200);

      // всё ещё ровно один пользователь с этим email — повторная регистрация конфликтует
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(409);
    });

    it('возвращает 400 при невалидном email', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'not-an-email', password: 'correct-horse-battery-staple' })
        .expect(400);
    });

    it('возвращает 400 при отсутствующих полях', async () => {
      await request(app.getHttpServer()).post('/auth/login').send({}).expect(400);
    });

    it('accessToken — валидный JWT с email в payload', async () => {
      const email = uniqueEmail();
      const password = 'correct-horse-battery-staple';

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      const payload = decodeJwtPayload(res.body.accessToken);
      expect(payload.email).toBe(email);
    });
  });
});
