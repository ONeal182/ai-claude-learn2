# CLAUDE.md — apps/web

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4. Dev-порт **3000**.

## Команды

Запускать через корень (`pnpm web <script>`) или из этой папки:

| Команда            | Действие                          |
| ------------------ | -------------------------------- |
| `pnpm dev`         | `next dev` (watch, порт 3000)     |
| `pnpm build`       | `next build`                      |
| `pnpm start`       | `next start` (после `build`)      |
| `pnpm lint`        | `eslint`                          |
| `pnpm typecheck`   | `tsc --noEmit`                    |

## Структура

```
src/
└── app/                # App Router
    ├── layout.tsx      # корневой layout
    ├── page.tsx        # /
    └── globals.css     # глобальные стили + Tailwind
public/                 # статика (next.svg, vercel.svg, ...)
```

## Соглашения

- **App Router**, серверные компоненты по умолчанию; `"use client"` — только когда нужен клиент.
- Алиас импорта: `@/*` → `./src/*` (см. `tsconfig.json`).
- Стили — **Tailwind v4** через `@tailwindcss/postcss` (`postcss.config.mjs`), директивы в `src/app/globals.css`. Отдельного `tailwind.config` нет.
- Тёмная тема — через классы `dark:` (см. `page.tsx`).
- Линт — flat-config `eslint.config.mjs` (`core-web-vitals` + `typescript` из `eslint-config-next`).
- Публичные env-переменные — с префиксом `NEXT_PUBLIC_` (пример: `NEXT_PUBLIC_API_URL` в `.env.example`), доступны в браузере.
- Конфиг фреймворка — `next.config.ts`.

## Связь с API

Обращения к NestJS-сервису идут по `process.env.NEXT_PUBLIC_API_URL` (по умолчанию `http://localhost:3001`).

## Актуализация документации

Меняешь архитектуру `web` — обновляй этот файл в том же изменении:

- новая верхнеуровневая директория в `src/`, изменение структуры роутинга или слоёв → раздел «Структура»;
- новые алиасы импортов, правила линта, переход на другой подход к стилям/данным → раздел «Соглашения»;
- новые/переименованные скрипты или порт → таблица «Команды» (и корневой `CLAUDE.md`, если затронут общий пайплайн);
- новые `NEXT_PUBLIC_*` переменные → `.env.example` и раздел «Связь с API».
