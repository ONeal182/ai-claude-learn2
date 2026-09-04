import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';

/**
 * Контракт модуля Profile (пока не реализован — тесты специально красные, TDD).
 *
 * Все эндпоинты — под авторизацией: заголовок `Authorization: Bearer <accessToken>`.
 * Токен берётся из уже реализованного auth-модуля (POST /auth/register -> { accessToken }).
 * Без токена любой эндпоинт отвечает 401.
 *
 * GET /users/me
 *   -> 200 { id, email, name, avatarUrl, createdAt }   name/avatarUrl — null для нового пользователя
 *   -> 401                                             без токена
 *
 * PATCH /users/me { name }
 *   -> 200 <profile>       имя обновлено, поле name в дальнейших GET /users/me отражает новое значение
 *   -> 400                 name из одних пробелов (после trim пусто) или длиннее 50 символов — значение в БД не меняется
 *   -> 401                 без токена
 */

const MAX_NAME_LENGTH = 50;

function uniqueEmail(): string {
  return `${randomUUID()}@example.com`;
}

describe('Profile (e2e)', () => {
  let app: INestApplication<Server>;
  let accessToken: string;
  let email: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    email = uniqueEmail();
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'correct-horse-battery-staple' })
      .expect(201);
    accessToken = res.body.accessToken as string;
  });

  afterEach(async () => {
    await app.close();
  });

  const auth = () => `Bearer ${accessToken}`;

  describe('GET /users/me', () => {
    it('возвращает 401 без токена', async () => {
      await request(app.getHttpServer()).get('/users/me').expect(401);
    });

    it('возвращает профиль нового пользователя', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', auth())
        .expect(200);

      expect(typeof res.body.id).toBe('string');
      expect(res.body.id.length).toBeGreaterThan(0);
      expect(res.body.email).toBe(email);
      expect(res.body.name).toBeNull();
      expect(res.body.avatarUrl).toBeNull();
      expect(typeof res.body.createdAt).toBe('string');
    });
  });

  describe('PATCH /users/me', () => {
    it('возвращает 401 без токена', async () => {
      await request(app.getHttpServer()).patch('/users/me').send({ name: 'Иван' }).expect(401);
    });

    it('обновляет имя, GET /users/me далее отражает новое значение', async () => {
      const res = await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', auth())
        .send({ name: 'Иван' })
        .expect(200);

      expect(res.body.name).toBe('Иван');

      const getRes = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', auth())
        .expect(200);

      expect(getRes.body.name).toBe('Иван');
    });

    it('возвращает 400 для имени из одних пробелов и не меняет значение в БД', async () => {
      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', auth())
        .send({ name: 'Иван' })
        .expect(200);

      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', auth())
        .send({ name: '   ' })
        .expect(400);

      const getRes = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', auth())
        .expect(200);

      expect(getRes.body.name).toBe('Иван');
    });

    it('возвращает 400 для имени длиннее 50 символов и не меняет значение в БД', async () => {
      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', auth())
        .send({ name: 'Иван' })
        .expect(200);

      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', auth())
        .send({ name: 'a'.repeat(MAX_NAME_LENGTH + 1) })
        .expect(400);

      const getRes = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', auth())
        .expect(200);

      expect(getRes.body.name).toBe('Иван');
    });
  });
});
