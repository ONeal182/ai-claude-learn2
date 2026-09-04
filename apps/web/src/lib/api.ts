const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface Credentials {
  email: string;
  password: string;
}

/** Ответ `POST /auth/register` и `POST /auth/login` NestJS-сервиса. */
export interface AuthResult {
  accessToken: string;
}

/**
 * Ошибка обращения к API. `status === 0` — сеть недоступна (сервер не ответил),
 * иначе это HTTP-статус ответа. `messages` — список сообщений (Nest ValidationPipe
 * возвращает массив в поле `message`).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly messages: string[];

  constructor(status: number, messages: string[]) {
    super(messages[0] ?? `Запрос завершился с ошибкой ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.messages = messages;
  }
}

function normalizeMessages(message: unknown): string[] | null {
  if (Array.isArray(message)) return message.map(String);
  if (typeof message === 'string') return [message];
  return null;
}

/** Общий POST-запрос к эндпоинтам аутентификации. Возвращает JWT при успехе. */
async function authRequest(path: string, credentials: Credentials): Promise<AuthResult> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
  } catch {
    throw new ApiError(0, ['Не удалось связаться с сервером. Проверьте, что API запущен.']);
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const messages = normalizeMessages(
      body && typeof body === 'object' ? (body as Record<string, unknown>).message : null,
    );

    throw new ApiError(response.status, messages ?? [`Ошибка сервера (${response.status}).`]);
  }

  return body as AuthResult;
}

/** Регистрация пользователя по email + паролю. */
export function registerUser(credentials: Credentials): Promise<AuthResult> {
  return authRequest('/auth/register', credentials);
}

/** Вход по email + паролю. */
export function loginUser(credentials: Credentials): Promise<AuthResult> {
  return authRequest('/auth/login', credentials);
}

/** Встреча — ответ `GET /meetings` NestJS-сервиса (даты приходят ISO-строками). */
export interface Meeting {
  id: string;
  title: string;
  startsAt: string;
  createdAt: string;
  updatedAt: string;
}

/** GET к защищённому эндпоинту под `Authorization: Bearer <accessToken>`. Бросает `ApiError`. */
async function bearerGet<T>(path: string, accessToken: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new ApiError(0, ['Не удалось связаться с сервером. Проверьте, что API запущен.']);
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const messages = normalizeMessages(
      body && typeof body === 'object' ? (body as Record<string, unknown>).message : null,
    );

    throw new ApiError(response.status, messages ?? [`Ошибка сервера (${response.status}).`]);
  }

  return body as T;
}

/** Список встреч. Требует `Authorization: Bearer <accessToken>` — эндпоинт под `JwtAuthGuard`. */
export function getMeetings(accessToken: string): Promise<Meeting[]> {
  return bearerGet<Meeting[]>('/meetings', accessToken);
}

/**
 * Одна встреча по идентификатору (`GET /meetings/:id` под `JwtAuthGuard`).
 * `ApiError` с `status === 404` — встречи нет, `status === 401` — токен невалиден.
 */
export function getMeeting(id: string, accessToken: string): Promise<Meeting> {
  return bearerGet<Meeting>(`/meetings/${encodeURIComponent(id)}`, accessToken);
}
