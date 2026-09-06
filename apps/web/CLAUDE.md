# CLAUDE.md — apps/web

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, HeroUI v3. Dev-порт **3000**.

## Команды

Запускать через корень (`pnpm web <script>`) или из этой папки:

| Команда          | Действие                                                             |
| ---------------- | ------------------------------------------------------------------- |
| `pnpm dev`       | `next dev` (watch, порт 3000)                                       |
| `pnpm build`     | `next build`                                                        |
| `pnpm start`     | `next start` (после `build`)                                        |
| `pnpm lint`      | `eslint` (flat-config `eslint.config.mjs`)                          |
| `pnpm typecheck` | `next typegen && tsc --noEmit` (typegen генерит типы роутов)        |

## Правила (`.claude/rules/`)

Детальные сквозные правила — в focused-файлах (автозагрузкой не подхватываются, читать по ссылке):

- [`heroui.md`](../../.claude/rules/heroui.md) — HeroUI v3: `onPress`, compound, порядок `@import`, клиентские обёртки
- [`dark-theme.md`](../../.claude/rules/dark-theme.md) — `.dark` на `<html>`, `@custom-variant dark`, скрипт до отрисовки, контраст 4.5:1
- [`web-api-client.md`](../../.claude/rules/web-api-client.md) — `src/lib/api.ts`, `bearerRequest`, `ApiError.status`, загрузка через `XMLHttpRequest`, поллинг
- [`client-auth.md`](../../.claude/rules/client-auth.md) — сессия в `localStorage`, `useAuthedResource(load)`, `401 → clearSession`

## Структура

```
src/
├── app/                # App Router (роуты — server-компоненты)
│   ├── layout.tsx      # корневой layout + скрипт темы (см. dark-theme.md)
│   ├── page.tsx        # / — защищённая главная, рендерит <Dashboard />
│   ├── register/page.tsx  # /register
│   ├── login/page.tsx     # /login, после успеха → /
│   ├── meetings/[id]/page.tsx # детали встречи + блок «Файлы»; рендерит <MeetingDetails id={id} />
│   └── globals.css     # Tailwind + HeroUI + токены темы
├── components/         # клиентские (`"use client"`) React-компоненты на HeroUI
│   │                   # register-form, login-form, dashboard, meeting-details, meeting-files, icons
├── hooks/
│   └── use-authed-resource.ts # сценарий защищённой страницы (см. client-auth.md)
└── lib/                # логика без React
    ├── api.ts          # клиент NestJS-API (см. web-api-client.md)
    └── session.ts      # сессия в localStorage
public/                 # статика
```

## Соглашения

- **App Router**, серверные компоненты по умолчанию; `"use client"` — только когда нужен клиент.
- Алиас импорта: `@/*` → `./src/*` (`tsconfig.json`).
- Слои: `app/` — роуты, `components/` — клиентские компоненты, `hooks/` — клиентские хуки (`"use client"`), `lib/` — логика без React.
- Стили — Tailwind v4 через `@tailwindcss/postcss` (`postcss.config.mjs`), директивы в `src/app/globals.css`; отдельного `tailwind.config` нет. HeroUI v3 — см. [`heroui.md`](../../.claude/rules/heroui.md).
- Тёмная тема, контраст — см. [`dark-theme.md`](../../.claude/rules/dark-theme.md).
- Публичные env — с префиксом `NEXT_PUBLIC_` (`NEXT_PUBLIC_API_URL` в `.env.example`); см. [`.claude/rules/env.md`](../../.claude/rules/env.md).
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

## Связь с API и аутентификация

Клиент API — `src/lib/api.ts` (компоненты не зовут `fetch` напрямую), правила в
[`web-api-client.md`](../../.claude/rules/web-api-client.md). Сессия и защита страниц — целиком на
клиенте (`localStorage` + `useAuthedResource`), правила в
[`client-auth.md`](../../.claude/rules/client-auth.md). Форма ответов и коды ошибок API — в
`apps/api/CLAUDE.md` и его модульных `CLAUDE.md`.

## Актуализация документации

Меняешь архитектуру `web` — обновляй документацию в том же изменении:

- новая верхнеуровневая директория в `src/`, изменение структуры роутинга или слоёв → раздел «Структура»;
- новое сквозное правило (стили, тема, работа с API, аутентификация) → соответствующий файл в `.claude/rules/` (и строка в списке «Правила», если файл новый); мелкие правила — раздел «Соглашения»;
- новые/переименованные скрипты или порт → таблица «Команды» (и корневой `CLAUDE.md`, если затронут общий пайплайн);
- новые `NEXT_PUBLIC_*` переменные → `.env.example` и [`.claude/rules/env.md`](../../.claude/rules/env.md).
