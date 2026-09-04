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
│   ├── meetings/
│   │   └── [id]/       # /meetings/[id] — детали встречи (заголовок, время); server-компонент разворачивает params и рендерит <MeetingDetails id={id} />
│   │       └── page.tsx
│   └── globals.css     # глобальные стили + Tailwind + HeroUI
├── components/         # переиспользуемые React-компоненты (register-form.tsx, login-form.tsx, dashboard.tsx, meeting-details.tsx — клиентские, на HeroUI)
├── hooks/              # клиентские React-хуки
│   └── use-authed-resource.ts # общий сценарий защищённой страницы: сессия → /login, load(token), 401 → clearSession + /login
└── lib/                # платформенно-независимая логика без React
    ├── api.ts          # клиент NestJS-API (registerUser, loginUser, getMeetings, getMeeting, ApiError) поверх fetch
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
HTTP-вызовы инкапсулированы в `src/lib/api.ts` (обёртка над `fetch`): `registerUser` → `POST /auth/register`, `loginUser` → `POST /auth/login`, обе возвращают `{ accessToken }`; `getMeetings` → `GET /meetings`, `getMeeting(id, token)` → `GET /meetings/:id` (оба с `Authorization: Bearer <accessToken>` через общий хелпер `bearerGet`, возвращают `Meeting[]` / `Meeting`; `ApiError` с `status === 404` — встречи нет). При ошибке бросается `ApiError` с `status` и `messages` (`status === 0` — сеть недоступна). Клиентские компоненты не дёргают `fetch` напрямую. API отдаёт CORS для всех источников (`app.enableCors()`).

## Аутентификация на клиенте

Сессия (`accessToken` + `email`) хранится в `localStorage` через `src/lib/session.ts` (`saveSession`/`getSession`/`clearSession`) — токен из NestJS не декодируется на клиенте. `LoginForm` и `RegisterForm` вызывают `saveSession` сразу после успешного `loginUser`/`registerUser`. Логин дополнительно редиректит на `/` (`router.push`).

Сценарий защищённой страницы вынесен в хук `useAuthedResource(load)` (`src/hooks/use-authed-resource.ts`): при монтировании читает сессию через `getSession()`, при её отсутствии редиректит на `/login` (`router.replace`); зовёт `load(accessToken)`; ответ `401` чистит сессию и тоже уводит на `/login`. Возвращает `{ status: 'loading' | 'ready' | 'error', data, error, session }` — прочие ошибки (в т.ч. `ApiError` со `status === 404`) остаются в `error`, страница показывает их сама. `load` должен быть стабильным (импортированная функция или `useCallback`). Защита целиком клиентская (нет middleware/cookies) — согласуется с хранением токена в `localStorage`.

Главная страница (`/`, `Dashboard` в `src/components/dashboard.tsx`) на этом хуке грузит `GET /meetings`; кнопка «Выйти» вызывает `clearSession()` и редиректит на `/login`. Страница встречи (`/meetings/[id]`, `MeetingDetails` в `src/components/meeting-details.tsx`) грузит `getMeeting(id)`; `error` с `ApiError.status === 404` рисует состояние «Встреча не найдена» (без редиректа), прочие ошибки — алерт. Строка встречи на дашборде (`MeetingRow`) — это `next/link` на `/meetings/${id}`.

## Актуализация документации

Меняешь архитектуру `web` — обновляй этот файл в том же изменении:

- новая верхнеуровневая директория в `src/`, изменение структуры роутинга или слоёв → раздел «Структура»;
- новые алиасы импортов, правила линта, переход на другой подход к стилям/данным → раздел «Соглашения»;
- новые/переименованные скрипты или порт → таблица «Команды» (и корневой `CLAUDE.md`, если затронут общий пайплайн);
- новые `NEXT_PUBLIC_*` переменные → `.env.example` и раздел «Связь с API».
