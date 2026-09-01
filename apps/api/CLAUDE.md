# CLAUDE.md — apps/api

NestJS 12, TypeScript, **чистый ESM** (`"type": "module"`). Линт — oxlint, тесты — vitest. Dev-порт **3001**.

## Команды

Запускать через корень (`pnpm api <script>`) или из этой папки:

| Команда           | Действие                                        |
| ----------------- | --------------------------------------------- |
| `pnpm dev`        | `nest start --watch` (порт 3001)               |
| `pnpm start`      | `nest start`                                   |
| `pnpm start:prod` | `node dist/main` (после `build`)               |
| `pnpm build`      | `nest build` → `dist/`                         |
| `pnpm lint`       | `oxlint src/ test/`                            |
| `pnpm typecheck`  | `tsc --noEmit -p tsconfig.json`                |
| `pnpm test`       | `vitest run` (файлы `**/*.spec.ts`)            |
| `pnpm test:watch` | `vitest`                                       |
| `pnpm test:cov`   | `vitest run --coverage`                        |
| `pnpm test:e2e`   | `vitest run --config ./vitest.config.e2e.ts`   |

## Структура

```
src/
├── main.ts             # bootstrap, app.listen(PORT ?? 3001)
├── app.module.ts       # корневой модуль
├── app.controller.ts   # GET /
├── app.service.ts
└── app.controller.spec.ts
test/
└── app.e2e-spec.ts     # e2e
```

## Соглашения

- **ESM**: относительные импорты — с расширением `.js` (например `import { AppModule } from './app.module.js'`), даже для `.ts`-файлов. Это обязательно (`nodenext` resolution).
- Стандартная архитектура Nest: модуль → контроллер → сервис; DI через конструктор.
- Новый ресурс — `pnpm exec nest g resource <name>` (schematics в `nest-cli.json`, `sourceRoot: src`).
- Общая библиотека — `pnpm exec nest g library <name>`; path-алиасы из `tsconfig.json` резолвятся в тестах через `vite-tsconfig-paths`.
- `strict: true`, но `strictPropertyInitialization: false` (под DI и декораторы).
- vitest с `globals: true` — `describe/it/expect` без импорта; типы через `types: ["vitest/globals", "node"]`.
- Порт и окружение — из `.env` (`PORT`, `NODE_ENV`); шаблон — `.env.example`.
- Билд-конфиг для сборки — `tsconfig.build.json`, выход в `dist/` (`deleteOutDir: true`).

## Актуализация документации

Меняешь архитектуру `api` — обновляй этот файл в том же изменении:

- новый модуль/ресурс верхнего уровня, смена структуры `src/` → раздел «Структура»;
- новые правила по ESM, DI, конфигурации, тестам или изменения `tsconfig`/`nest-cli.json` → раздел «Соглашения»;
- новые/переименованные скрипты или порт → таблица «Команды» (и корневой `CLAUDE.md`, если затронут общий пайплайн);
- новые env-переменные → `.env.example` и раздел «Соглашения».
