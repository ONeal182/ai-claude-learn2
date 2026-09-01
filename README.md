# monorepo

Монорепозиторий на **pnpm workspaces** + **Turborepo**.

## Состав

| Пакет        | Стек                                             | Порт (dev) |
| ------------ | ----------------------------------------------- | ---------- |
| `apps/web`   | Next.js 16 (App Router, TS, Tailwind v4, ESLint) | 3000       |
| `apps/api`   | NestJS 12 (TS, ESM, oxlint, vitest)             | 3001       |
| `packages/*` | место для общих библиотек (пока пусто)           | —          |

## Требования

- Node.js >= 24 (см. `.node-version` / `.nvmrc`)
- pnpm 11 (`corepack enable`, версия закреплена в `package.json` → `packageManager`)

## Установка

```bash
pnpm install
```

## Скрипты (из корня)

| Команда              | Действие                                             |
| -------------------- | --------------------------------------------------- |
| `pnpm dev`           | запускает `web` и `api` в watch-режиме параллельно   |
| `pnpm build`         | продакшн-сборка всех пакетов                         |
| `pnpm start`         | сборка + запуск всех пакетов                         |
| `pnpm lint`          | линт всех пакетов (ESLint для web, oxlint для api)   |
| `pnpm typecheck`     | `tsc --noEmit` по всем пакетам                       |
| `pnpm test`          | тесты всех пакетов (vitest в api)                    |
| `pnpm format`        | Prettier — форматирование всего репозитория          |
| `pnpm format:check`  | Prettier — проверка без изменений                    |

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

Postgres в Docker (`docker-compose.yml`, образ `postgres:17-alpine`, порт `5432`):

```bash
cp .env.example .env
docker compose up -d postgres   # поднять
docker compose down             # остановить
docker compose down -v          # остановить и удалить данные (том postgres-data)
```

## Переменные окружения

Скопируйте примеры и заполните значения:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```
