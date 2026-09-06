# CLAUDE.md — apps/web

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4. Dev-порт **3000**.

## Команды

Запускать через корень (`pnpm web <script>`) или из этой папки:

| Команда          | Действие                                                              |
| ---------------- | --------------------------------------------------------------------- |
| `pnpm dev`       | `next dev` (watch, порт 3000)                                         |
| `pnpm build`     | `next build`                                                          |
| `pnpm start`     | `next start` (после `build`)                                          |
| `pnpm lint`      | `eslint`                                                              |
| `pnpm typecheck` | `next typegen && tsc --noEmit` (typegen генерит типы роутов/лейаутов) |

## Структура

```
src/
├── app/                # App Router
│   ├── layout.tsx      # корневой layout (+ инлайн-скрипт темы: класс `.dark` по системной prefers-color-scheme)
│   ├── page.tsx        # / — защищённая главная (email пользователя, список встреч, выход); рендерит <Dashboard />
│   ├── register/       # /register — страница регистрации (email + пароль)
│   │   └── page.tsx
│   ├── login/          # /login — страница входа (email + пароль), после успеха редирект на /
│   │   └── page.tsx
│   ├── profile/
│   │   └── edit/       # /profile/edit — три независимых блока (имя / аватар с превью / пароль); рендерит <ProfileEdit />
│   │       └── page.tsx
│   ├── meetings/
│   │   └── [id]/       # /meetings/[id] — детали встречи (заголовок, время) + блок «Файлы»; server-компонент разворачивает params и рендерит <MeetingDetails id={id} />
│   │       └── page.tsx
│   └── globals.css     # глобальные стили + Tailwind + HeroUI
├── components/         # переиспользуемые React-компоненты (register-form.tsx, login-form.tsx, dashboard.tsx, meeting-details.tsx, meeting-files.tsx, profile-edit.tsx, avatar.tsx — клиентские, на HeroUI)
├── hooks/              # клиентские React-хуки
│   └── use-authed-resource.ts # общий сценарий защищённой страницы: сессия → /login, load(token), 401 → clearSession + /login
└── lib/                # платформенно-независимая логика без React
    ├── api.ts          # клиент NestJS-API (registerUser, loginUser, getMeetings, getMeeting; профиль: getMe, avatarSrc, updateProfileName, changePassword, uploadAvatar; файлы встречи: getMeetingFiles, uploadMeetingFile, downloadMeetingFile, deleteMeetingFile, reprocessMeetingFile; ApiError) поверх fetch/XMLHttpRequest
    └── session.ts       # сессия в localStorage (saveSession/getSession/clearSession — accessToken + email)
public/                 # статика (next.svg, vercel.svg, ...)
```

## Соглашения

- **App Router**, серверные компоненты по умолчанию; `"use client"` — только когда нужен клиент.
- Алиас импорта: `@/*` → `./src/*` (см. `tsconfig.json`).
- Слои: `app/` — роуты, `components/` — клиентские React-компоненты, `hooks/` — переиспользуемые клиентские хуки (`"use client"`), `lib/` — логика без React.
- Стили — **Tailwind v4** через `@tailwindcss/postcss` (`postcss.config.mjs`), директивы в `src/app/globals.css`. Отдельного `tailwind.config` нет.
- UI-библиотека — **HeroUI v3** (`@heroui/react` + `@heroui/styles`, поверх Tailwind v4 и React Aria). Провайдер не нужен; `@import "@heroui/styles"` в `globals.css` идёт **после** `@import "tailwindcss"`. Компоненты — compound-паттерн (`Card.Header` и т.п.), обработчики — `onPress`, а не `onClick`. Интерактивные компоненты рендерятся в клиентских (`"use client"`) обёртках в `src/components/`.
- Тёмная тема — по классу `.dark` на `<html>` (один селектор и для Tailwind `dark:`, и для токенов HeroUI v3). Tailwind-вариант переопределён на классовый в `globals.css` (`@custom-variant dark`), сам класс ставит инлайн-скрипт в `layout.tsx` по системной `prefers-color-scheme` до первой отрисовки.
- Линт — flat-config `eslint.config.mjs` (`core-web-vitals` + `typescript` из `eslint-config-next`).
- Публичные env-переменные — с префиксом `NEXT_PUBLIC_` (пример: `NEXT_PUBLIC_API_URL` в `.env.example`), доступны в браузере.
- Конфиг фреймворка — `next.config.ts`.

## Проверка UI-изменений (обязательно)

Любое изменение, затрагивающее интерфейс (вёрстка, стили, компоненты, страницы,
`globals.css`, токены, тема), **не считается завершённым**, пока не сделано и то и другое:

1. **Визуальная проверка через Playwright MCP** — только этим инструментом, не «на глаз»
   по коду и не скриншотами из другого источника. Открыть запущенный dev-сервер
   (`http://localhost:3000` — сервер всегда поднят, самому не запускать) и проверить:
   светлую и тёмную тему, мобильную и десктопную ширину, интерактивные состояния
   (фокус, ошибки валидации, загрузка, hover/active), отсутствие ошибок в консоли.
2. **Ревью по скиллу `ui-ux-pro-max`** — прогнать изменение через его данные
   (поиск по нужным доменам: accessibility, forms, typography/color, layout и т.п.)
   и убедиться, что правки не нарушают его правил (контраст ≥ 4.5:1, тач-цели,
   иерархия заголовков, семантика форм и пр.).

Прохождение `typecheck` / `lint` / `build` — необходимое, но **недостаточное** условие.

## Связь с API

Обращения к NestJS-сервису идут по `process.env.NEXT_PUBLIC_API_URL` (по умолчанию `http://localhost:3001`).
HTTP-вызовы инкапсулированы в `src/lib/api.ts` (обёртка над `fetch`): `registerUser` → `POST /auth/register`, `loginUser` → `POST /auth/login`, обе возвращают `{ accessToken }`; `getMeetings` → `GET /meetings`, `getMeeting(id, token)` → `GET /meetings/:id` (оба через общий хелпер `bearerRequest(path, token, method='GET')` — `fetch` с `Authorization: Bearer <accessToken>`, возвращают `Meeting[]` / `Meeting`; `ApiError` с `status === 404` — встречи нет). Разбор ответа общий: `networkError()` (`status === 0` — сеть недоступна) и `readBodyOrThrow(response)` (пустое тело → `undefined`, не-`ok` → `ApiError` через `messagesFromBody`). Клиентские компоненты не дёргают `fetch` напрямую. API отдаёт CORS для всех источников (`app.enableCors()`).

Профиль (`/users/me`, все под `Authorization: Bearer`): `getMe(token)` → `Me` (`{ id, email, name, avatarUrl, createdAt }`) через `bearerRequest`; `avatarSrc(avatarUrl)` дописывает `API_URL` к относительному `avatarUrl` (картинку раздаёт сам сервис), `null` и абсолютные ссылки не трогает. Изменения: `updateProfileName(token, name)` → `PATCH /users/me` (`bearerJsonRequest` — POST/PATCH с JSON под Bearer), `changePassword(token, { currentPassword, newPassword })` → `POST /users/me/password` (`Promise<void>`), `uploadAvatar(token, file)` → `PUT /users/me/avatar` (multipart, поле `file`). Ошибки этих трёх пропускаются через `withFriendlyErrors` — подмена текста `ApiError` понятным сообщением по статусу (`400` — валидация имени/пароля или формат не image, `401` — сессия истекла / неверный текущий пароль, `413` — файл > 5 МБ); сетевую ошибку (`status === 0`) не трогает.

Файлы встречи (`/meetings/:id/files`, все под `Authorization: Bearer`): `getMeetingFiles(meetingId, token)` → список `MeetingFile[]` (`bearerRequest`); `uploadMeetingFile({ meetingId, file, type, accessToken, onProgress })` — `POST` multipart через **`XMLHttpRequest`** (нужен `upload.onprogress`); `type` (`recording` | `attachment`) определяет **компонент** (`detectFileType`: mime `audio/*`/`video/*`, при пустом mime — по расширению) с ручным переопределением, а не api-клиент; `413` / `400` / `0` мапятся в понятный текст в компоненте; `downloadMeetingFile(meetingId, fileId, token)` — эндпоинт под guard, поэтому качает `fetch` с заголовком и возвращает `{ blob, filename }` (имя из `Content-Disposition`), сам файл сохраняет вызывающий компонент через скрытый `<a download>`; `deleteMeetingFile` / `reprocessMeetingFile` — `DELETE` / `POST .../reprocess` через `bearerRequest` с нужным методом (тело ошибки Nest разбирает `messagesFromBody`). `reprocess` для не-`failed` → `ApiError` со `status === 409`.

## Аутентификация на клиенте

Сессия (`accessToken` + `email`) хранится в `localStorage` через `src/lib/session.ts` (`saveSession`/`getSession`/`clearSession`) — токен из NestJS не декодируется на клиенте. `LoginForm` и `RegisterForm` вызывают `saveSession` сразу после успешного `loginUser`/`registerUser`. Логин дополнительно редиректит на `/` (`router.push`).

Сценарий защищённой страницы вынесен в хук `useAuthedResource(load)` (`src/hooks/use-authed-resource.ts`): при монтировании читает сессию через `getSession()`, при её отсутствии редиректит на `/login` (`router.replace`); зовёт `load(accessToken)`; ответ `401` чистит сессию и тоже уводит на `/login`. Возвращает `{ status: 'loading' | 'ready' | 'error', data, error, session }` — прочие ошибки (в т.ч. `ApiError` со `status === 404`) остаются в `error`, страница показывает их сама. `load` должен быть стабильным (импортированная функция или `useCallback`). Защита целиком клиентская (нет middleware/cookies) — согласуется с хранением токена в `localStorage`.

Страница `/profile/edit` (`ProfileEdit` в `src/components/profile-edit.tsx`) на `useAuthedResource(getMe)` — три независимых блока (`Card` + `Form`): имя, аватар (выбор файла + превью через `URL.createObjectURL`, object URL считается при рендере и освобождается в эффекте — без `setState` в эффекте) и пароль (текущий / новый / подтверждение + скрытое `username`-поле для менеджеров паролей). У каждого блока свой статус: успех (`role="status"`, текст `text-foreground` + галочка) и ошибка (`role="alert"`); общий хук `useSaveState` (`run` → `Promise<boolean>`, `fail(msg)` — ошибка блока без запроса). Валидация до запроса: имя 1..50 после trim, новый пароль ≥ 8 и равен подтверждению (нативная валидация react-aria блокирует submit), файл `image/jpeg|png|webp` и ≤ 5 МБ (`validateAvatarFile` в `handleFileChange`). После успешной смены имени/аватара — `router.push('/profile')` (страница профиля перечитывает `getMe`). Неверный текущий пароль → `ApiError` 401 ловится локально: ошибка у блока пароля, сессия **не** чистится (это не 401 загрузки страницы), поля остаются заполненными; успех — сообщение, пользователь остаётся на странице. Компонент `src/components/avatar.tsx` (`<img>` по `avatarSrc` с фолбэком на инициалы) — для текущего аватара.

Главная страница (`/`, `Dashboard` в `src/components/dashboard.tsx`) на этом хуке грузит `GET /meetings`; кнопка «Выйти» вызывает `clearSession()` и редиректит на `/login`. Страница встречи (`/meetings/[id]`, `MeetingDetails` в `src/components/meeting-details.tsx`) грузит `getMeeting(id)`; `error` с `ApiError.status === 404` рисует состояние «Встреча не найдена» (без редиректа), прочие ошибки — алерт. Строка встречи на дашборде (`MeetingRow`) — это `next/link` на `/meetings/${id}`.

Блок «Файлы» (`MeetingFiles` в `src/components/meeting-files.tsx`) рендерится под карточкой встречи, когда `useAuthedResource` уже отдал `session` — `accessToken` приходит пропом, `useAuthedResource` здесь не используется. Своё состояние списка (первичная загрузка через `.then/.catch` в эффекте — без синхронного `setState`, иначе ловит `react-hooks/set-state-in-effect`; ручное/фоновое обновление через `refreshFiles`). Пока в списке есть файл в `pending`/`processing` — поллинг `getMeetingFiles` раз в 3 с (`POLL_INTERVAL_MS`), плюс кнопка «Обновить». Любой `ApiError` со `status === 401` (загрузка, список, действие в строке) → `handleAuthError`: `clearSession()` + `router.replace('/login')` и выставляет `deadRef`, чтобы поллинг и отложенные ответы дальше не трогали state. За раз грузится **один** файл (`uploadFile`), сегментный переключатель над зоной задаёт `recording` / `attachment` / авто. Зона загрузки — настоящий `<button>` (drag-n-drop + выбор + нативная клавиатура), статус-«чип» несёт смысл подписью и цветной точкой, текст всегда `text-foreground` (вивидные `--success`/`--warning` мелким текстом на светлом фоне не проходят контраст 4.5:1; ср. правило для `--danger` в `globals.css`). «Удалить» — необратимое действие, поэтому идёт через HeroUI `AlertDialog` (подтверждение с именем файла), а не сразу по клику.

## Актуализация документации

Меняешь архитектуру `web` — обновляй этот файл в том же изменении:

- новая верхнеуровневая директория в `src/`, изменение структуры роутинга или слоёв → раздел «Структура»;
- новые алиасы импортов, правила линта, переход на другой подход к стилям/данным → раздел «Соглашения»;
- новые/переименованные скрипты или порт → таблица «Команды» (и корневой `CLAUDE.md`, если затронут общий пайплайн);
- новые `NEXT_PUBLIC_*` переменные → `.env.example` и раздел «Связь с API».
