import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { MAX_PROFILE_NAME_LENGTH } from './../src/profile/dto/update-profile-name.dto.js';

/**
 * Контракт модуля Profile.
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
 *
 * POST /users/me/password { currentPassword, newPassword }
 *   -> 200                 currentPassword верный, newPassword валиден: пароль сменён
 *                          (login по старому паролю -> 401, по новому -> 200);
 *                          ранее выданный accessToken остаётся валиден (GET /users/me -> 200)
 *   -> 400 | 401           currentPassword неверный — пароль не меняется (login по старому -> 200)
 *   -> 400                 newPassword короче 8 символов — пароль не меняется
 *   -> 401                 без токена
 */

const MIN_PASSWORD_LENGTH = 8;

function uniqueEmail(): string {
  return `${randomUUID()}@example.com`;
}

describe('Profile (e2e)', () => {
  let app: INestApplication<Server>;
  let accessToken: string;
  let email: string;
  const oldPassword = 'correct-horse-battery-staple';

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    email = uniqueEmail();
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: oldPassword })
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
        .send({ name: 'a'.repeat(MAX_PROFILE_NAME_LENGTH + 1) })
        .expect(400);

      const getRes = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', auth())
        .expect(200);

      expect(getRes.body.name).toBe('Иван');
    });
  });

  describe('POST /users/me/password', () => {
    const newPassword = 'brand-new-secret-password';

    it('возвращает 401 без токена', async () => {
      await request(app.getHttpServer())
        .post('/users/me/password')
        .send({ currentPassword: oldPassword, newPassword })
        .expect(401);
    });

    it('меняет пароль при верном currentPassword: старый пароль больше не логинит, новый — логинит', async () => {
      await request(app.getHttpServer())
        .post('/users/me/password')
        .set('Authorization', auth())
        .send({ currentPassword: oldPassword, newPassword })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: oldPassword })
        .expect(401);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: newPassword })
        .expect(200);
    });

    it('после успешной смены пароля ранее выданный accessToken остаётся валиден', async () => {
      await request(app.getHttpServer())
        .post('/users/me/password')
        .set('Authorization', auth())
        .send({ currentPassword: oldPassword, newPassword })
        .expect(200);

      await request(app.getHttpServer()).get('/users/me').set('Authorization', auth()).expect(200);
    });

    it('отвергает неверный currentPassword (400/401) и не меняет пароль', async () => {
      const res = await request(app.getHttpServer())
        .post('/users/me/password')
        .set('Authorization', auth())
        .send({ currentPassword: 'not-the-current-password', newPassword });

      expect([400, 401]).toContain(res.status);

      // старый пароль всё ещё действует
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: oldPassword })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: newPassword })
        .expect(401);
    });

    it('возвращает 400 для newPassword короче 8 символов и не меняет пароль', async () => {
      await request(app.getHttpServer())
        .post('/users/me/password')
        .set('Authorization', auth())
        .send({ currentPassword: oldPassword, newPassword: 'a'.repeat(MIN_PASSWORD_LENGTH - 1) })
        .expect(400);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: oldPassword })
        .expect(200);
    });
  });
});
