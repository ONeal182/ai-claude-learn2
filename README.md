# monorepo

Монорепозиторий на **pnpm workspaces** + **Turborepo**.

## Состав

| Пакет        | Стек                                                          | Порт (dev) |
| ------------ | ----------------------------------------------------------- | ---------- |
| `apps/web`   | Next.js 16 (App Router, React 19, TS, Tailwind v4, HeroUI v3) | 3000       |
| `apps/api`   | NestJS 12 (TS, ESM, oxlint, vitest)                          | 3001       |
| `packages/*` | место для общих библиотек `@repo/*` (пока пусто)             | —          |

## Требования

- Node.js >= 24 (см. `.node-version` / `.nvmrc`)
- pnpm 11 (`corepack enable`, версия закреплена в `package.json` → `packageManager`)

## Установка

```bash
pnpm install
```

## Скрипты (из корня)

| Команда             | Действие                                                          |
| ------------------- | --------------------------------------------------------------- |
| `pnpm dev`          | запускает `web` и `api` в watch-режиме параллельно                |
| `pnpm build`        | продакшн-сборка всех пакетов                                      |
| `pnpm start`        | сборка + запуск всех пакетов                                      |
| `pnpm lint`         | линт всех пакетов (ESLint для web, oxlint для api)                |
| `pnpm typecheck`    | `tsc --noEmit` по всем пакетам (в web перед этим `next typegen`)  |
| `pnpm test`         | юнит-тесты всех пакетов (vitest в api)                            |
| `pnpm test:e2e`     | e2e-тесты (api); требует поднятого Postgres                       |
| `pnpm format`       | Prettier — форматирование всего репозитория                       |
| `pnpm format:check` | Prettier — проверка без изменений                                 |
| `pnpm clean`        | очистка артефактов сборки и `node_modules`                        |

### Только один пакет

```bash
pnpm web dev          # = pnpm --filter web dev
pnpm api start:dev    # = pnpm --filter api start:dev
```

## Структура

```
monorepo/
├── apps/
│   ├── web/        # Next.js
│   └── api/        # NestJS
├── packages/       # общие пакеты (@repo/*)
├── package.json    # корень воркспейса + скрипты
├── pnpm-workspace.yaml
├── turbo.json      # пайплайн задач
├── .prettierrc.json
├── .editorconfig
└── .node-version
```

## База данных

Postgres в Docker (`docker-compose.yml`, образ `postgres:17-alpine`, порт `5432`, том `postgres-data`):

```bash
cp .env.example .env
docker compose up -d postgres   # поднять
docker compose down             # остановить (том сохраняется)
docker compose down -v          # остановить и удалить данные
```

## Переменные окружения

Скопируйте примеры и заполните значения:

```bash
cp .env.example .env                     # Postgres для docker-compose (POSTGRES_*, DATABASE_URL)
cp apps/api/.env.example apps/api/.env   # api: PORT, DATABASE_URL, JWT_*, UPLOADS_DIR, MAX_UPLOAD_SIZE_BYTES
cp apps/web/.env.example apps/web/.env   # web: NEXT_PUBLIC_API_URL
```

## Проверки

- Перед коммитом: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`. Хук `.husky/pre-commit` всегда гонит `lint`, а `test` + `test:e2e` — если коммит не только по докам/конфигу (`*.md`, `.claude/**`, `.agents/**`, `docs/**`, `plan/**`); `typecheck` хук не запускает. Для e2e нужен поднятый Postgres.
- CI (`.github/workflows/ci.yml`) на push в `main` и на любой PR прогоняет те же проверки на сервисе Postgres плюс `prisma generate` и `prisma migrate deploy`.
