# CLAUDE.md

Монорепозиторий на **pnpm workspaces** + **Turborepo**. Node >= 24, pnpm 11 (`corepack enable`).

## Структура

| Пакет        | Стек                                              | Порт (dev) | Своя инструкция          |
| ------------ | ------------------------------------------------ | ---------- | ----------------------- |
| `apps/web`   | Next.js 16 (App Router, React 19, TS, Tailwind v4) | 3000       | `apps/web/CLAUDE.md`    |
| `apps/api`   | NestJS 12 (TS, ESM, oxlint, vitest)              | 3001       | `apps/api/CLAUDE.md`    |
| `packages/*` | Общие библиотеки (`@repo/*`), пока пусто          | —          | —                       |

Воркспейсы объявлены в `pnpm-workspace.yaml` (`apps/*`, `packages/*`). Пайплайн задач — `turbo.json`.

## Команды (из корня)

| Команда             | Действие                                                  |
| ------------------- | ------------------------------------------------------- |
| `pnpm install`      | Установка зависимостей всего воркспейса                  |
| `pnpm dev`          | `web` + `api` в watch-режиме параллельно                 |
| `pnpm build`        | Продакшн-сборка всех пакетов (`turbo run build`)         |
| `pnpm start`        | Сборка + запуск                                          |
| `pnpm lint`         | Линт всех пакетов (ESLint для web, oxlint для api)       |
| `pnpm typecheck`    | `tsc --noEmit` по всем пакетам                           |
| `pnpm test`         | Тесты всех пакетов (vitest в api)                        |
| `pnpm format`       | Prettier по всему репозиторию                            |
| `pnpm format:check` | Prettier — проверка без изменений                        |

### Один пакет

```bash
pnpm web <script>    # = pnpm --filter web <script>
pnpm api <script>    # = pnpm --filter api <script>
```

## Соглашения

- Пакетный менеджер — только **pnpm** (версия закреплена в `package.json` → `packageManager`). Не использовать npm/yarn.
- Turbo кэширует `build`, `lint`, `typecheck`, `test`; `dev`/`start` — `persistent`, без кэша.
- pnpm блокирует postinstall-скрипты; разрешённые сборки перечислены в `pnpm-workspace.yaml` → `allowBuilds`.
- Форматирование — Prettier (`.prettierrc.json`), стиль отступов — `.editorconfig`. Хук `PostToolUse` в `.claude/settings.json` автоматически прогоняет Prettier по каждому файлу после `Write`/`Edit`.
- Перед коммитом прогонять `pnpm lint && pnpm typecheck && pnpm test`.

## База данных

Postgres поднимается через `docker-compose.yml` в корне (образ `postgres:17-alpine`, порт `5432`, том `postgres-data`).

```bash
cp .env.example .env          # параметры POSTGRES_* и DATABASE_URL
docker compose up -d postgres # поднять
docker compose down           # остановить (том сохраняется)
docker compose down -v        # остановить и удалить данные
```

## Переменные окружения

```bash
cp .env.example .env          # Postgres для docker-compose
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

## Общий код

Переиспользуемую логику выносить в `packages/*` как `@repo/<name>` и подключать через `workspace:*`.

## Актуализация документации

При изменении архитектуры проекта **в том же изменении** обновляй документацию:

- новый пакет/приложение в `apps/*` или `packages/*` → строка в таблице «Структура» здесь + собственный `CLAUDE.md` в папке пакета;
- изменились скрипты, порты, стек, пайплайн `turbo.json` или воркспейсы → соответствующие таблицы в этом файле и в `README.md`;
- новые/переименованные env-переменные → `.env.example` пакета и раздел «Переменные окружения»;
- изменились соглашения (структура папок, алиасы импортов, правила линта/сборки) → раздел «Соглашения» в корневом и/или пакетном `CLAUDE.md`.

Документацию и код правим одним PR — расхождение `CLAUDE.md` с реальностью считается багом.
