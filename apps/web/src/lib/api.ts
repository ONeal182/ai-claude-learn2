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

/** Достаёт человекочитаемые сообщения из тела ошибки Nest (поле `message`). */
function messagesFromBody(body: unknown, status: number): string[] {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>).message : null;
  return normalizeMessages(raw) ?? [`Ошибка сервера (${status}).`];
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
    throw new ApiError(response.status, messagesFromBody(body, response.status));
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
    throw new ApiError(response.status, messagesFromBody(body, response.status));
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

// ── Файлы встречи (`/meetings/:id/files`) ─────────────────────────────────────

/** Вид файла: `recording` уходит в фоновую обработку, `attachment` — нет. */
export type MeetingFileType = 'recording' | 'attachment';

/** Стадия обработки записи. `attachment` всегда `done`. */
export type MeetingFileStatus = 'pending' | 'processing' | 'done' | 'failed';

/** Файл встречи — элемент ответа `GET /meetings/:id/files` (даты — ISO-строки). */
export interface MeetingFile {
  id: string;
  meetingId: string;
  type: MeetingFileType;
  status: MeetingFileStatus;
  originalName: string;
  mimeType: string;
  size: number;
  transcriptText: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Прогресс загрузки: `fraction` — доля `0..1` или `undefined`, если длина неизвестна. */
export interface UploadProgress {
  loaded: number;
  total: number;
  fraction: number | undefined;
}

/** Запрос под `Authorization: Bearer` без тела (POST/DELETE). Пустой ответ (204/void) → `undefined`. */
async function bearerSend<T>(
  path: string,
  method: 'POST' | 'DELETE',
  accessToken: string,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new ApiError(0, ['Не удалось связаться с сервером. Проверьте, что API запущен.']);
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, messagesFromBody(body, response.status));
  }

  return body as T;
}

/** Список файлов встречи. `ApiError` со `status === 404` — встречи нет. */
export function getMeetingFiles(meetingId: string, accessToken: string): Promise<MeetingFile[]> {
  return bearerGet<MeetingFile[]>(`/meetings/${encodeURIComponent(meetingId)}/files`, accessToken);
}

/**
 * Загрузка файла (`POST /meetings/:id/files`, multipart) через `XMLHttpRequest` —
 * ради прогресса выгрузки (`onProgress`). Ошибки: `413` — файл больше лимита,
 * `400` — mime не из белого списка, `404` — встречи нет, `status === 0` — сеть.
 */
export function uploadMeetingFile(params: {
  meetingId: string;
  file: File;
  type: MeetingFileType;
  accessToken: string;
  onProgress?: (progress: UploadProgress) => void;
}): Promise<MeetingFile> {
  const { meetingId, file, type, accessToken, onProgress } = params;

  return new Promise<MeetingFile>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/meetings/${encodeURIComponent(meetingId)}/files`);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);

    if (onProgress) {
      xhr.upload.addEventListener('progress', (event) => {
        onProgress({
          loaded: event.loaded,
          total: event.total,
          fraction: event.lengthComputable ? event.loaded / event.total : undefined,
        });
      });
    }

    xhr.addEventListener('load', () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText) as unknown;
      } catch {
        body = null;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as MeetingFile);
        return;
      }

      reject(new ApiError(xhr.status, messagesFromBody(body, xhr.status)));
    });

    xhr.addEventListener('error', () => {
      reject(new ApiError(0, ['Не удалось связаться с сервером. Проверьте, что API запущен.']));
    });

    const form = new FormData();
    form.append('type', type);
    form.append('file', file);
    xhr.send(form);
  });
}

/** Достаёт имя файла из заголовка `Content-Disposition` (сначала `filename*`, затем ASCII). */
function filenameFromDisposition(header: string | null): string {
  if (!header) return 'файл';

  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      /* повреждённое значение — идём к ASCII-фолбэку */
    }
  }

  const ascii = /filename="([^"]+)"/i.exec(header);
  return ascii ? ascii[1] : 'файл';
}

/**
 * Содержимое файла (`GET /meetings/:id/files/:fileId/content`). Эндпоинт под
 * `JwtAuthGuard`, поэтому качаем `fetch` с заголовком и отдаём `Blob` + имя —
 * сохранение на диск инициирует вызывающий компонент. `ApiError` со `status === 404` —
 * файла нет.
 */
export async function downloadMeetingFile(
  meetingId: string,
  fileId: string,
  accessToken: string,
): Promise<{ blob: Blob; filename: string }> {
  let response: Response;

  try {
    response = await fetch(
      `${API_URL}/meetings/${encodeURIComponent(meetingId)}/files/${encodeURIComponent(fileId)}/content`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  } catch {
    throw new ApiError(0, ['Не удалось связаться с сервером. Проверьте, что API запущен.']);
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new ApiError(response.status, messagesFromBody(body, response.status));
  }

  return {
    blob: await response.blob(),
    filename: filenameFromDisposition(response.headers.get('Content-Disposition')),
  };
}

/** Удаление файла (`DELETE /meetings/:id/files/:fileId`). Повторное удаление → `ApiError` 404. */
export function deleteMeetingFile(
  meetingId: string,
  fileId: string,
  accessToken: string,
): Promise<void> {
  return bearerSend<void>(
    `/meetings/${encodeURIComponent(meetingId)}/files/${encodeURIComponent(fileId)}`,
    'DELETE',
    accessToken,
  );
}

/**
 * Перезапуск обработки (`POST /meetings/:id/files/:fileId/reprocess`) — только для
 * файла в статусе `failed`; для остальных статусов сервер отвечает `409`
 * (`ApiError` со `status === 409`).
 */
export function reprocessMeetingFile(
  meetingId: string,
  fileId: string,
  accessToken: string,
): Promise<MeetingFile> {
  return bearerSend<MeetingFile>(
    `/meetings/${encodeURIComponent(meetingId)}/files/${encodeURIComponent(fileId)}/reprocess`,
    'POST',
    accessToken,
  );
}
