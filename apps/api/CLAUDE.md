# CLAUDE.md — apps/api

NestJS 12, TypeScript, **чистый ESM** (`"type": "module"`). Линт — oxlint, тесты — vitest. Dev-порт **3001**.
БД — Postgres через **Prisma 7** (no-rust-engine, драйвер-адаптер `@prisma/adapter-pg`).

## Команды

Запускать через корень (`pnpm api <script>`) или из этой папки:

| Команда           | Действие                                     |
| ----------------- | -------------------------------------------- |
| `pnpm dev`        | `nest start --watch` (порт 3001)             |
| `pnpm start`      | `nest start`                                 |
| `pnpm start:prod` | `node dist/main` (после `build`)             |
| `pnpm build`      | `nest build` → `dist/`                       |
| `pnpm lint`       | `oxlint src/ test/`                          |
| `pnpm typecheck`  | `tsc --noEmit -p tsconfig.json`              |
| `pnpm test`       | `vitest run` (файлы `**/*.spec.ts`)          |
| `pnpm test:watch` | `vitest`                                     |
| `pnpm test:cov`   | `vitest run --coverage`                      |
| `pnpm test:e2e`   | `vitest run --config ./vitest.config.e2e.ts` |

Prisma (конфиг подключения — `prisma.config.ts`, не `datasource.url` в схеме — так с v7):

| Команда                                      | Действие                                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm exec prisma migrate dev --name <name>` | новая миграция из `schema.prisma` + применить + generate                                            |
| `pnpm exec prisma generate`                  | перегенерировать Prisma Client (нужно после каждого изменения схемы, если не гонялся `migrate dev`) |
| `pnpm exec prisma studio`                    | GUI для БД                                                                                          |

## Структура

```
prisma/
├── schema.prisma       # модели (User, Meeting)
└── migrations/
prisma.config.ts         # datasource url (env DATABASE_URL) — Prisma 7 не читает url из schema.prisma
src/
├── main.ts             # bootstrap, app.listen(PORT ?? 3001)
├── app.module.ts       # корневой модуль (ConfigModule, PrismaModule, AuthModule, MeetingModule, global ValidationPipe)
├── app.controller.ts   # GET /
├── app.service.ts
├── app.controller.spec.ts
├── prisma/
│   ├── prisma.module.ts    # @Global, экспортирует PrismaService
│   └── prisma.service.ts   # PrismaClient + PrismaPg-адаптер, $connect/$disconnect по lifecycle
├── auth/                # CQRS (@nestjs/cqrs) — контроллер не содержит бизнес-логики
│   ├── auth.module.ts      # CqrsModule.forRoot() + JwtModule.registerAsync + регистрация хендлеров; экспортирует JwtAuthGuard и JwtModule
│   ├── auth.controller.ts  # POST /auth/register, /auth/login — только CommandBus.execute(...)
│   ├── commands/
│   │   ├── impl/            # RegisterCommand, LoginCommand — { email, password }
│   │   └── handlers/        # RegisterHandler, LoginHandler — бизнес-логика, публикуют события
│   ├── queries/
│   │   ├── impl/            # FindUserByEmailQuery
│   │   └── handlers/        # FindUserByEmailHandler — единственная точка чтения User из Prisma
│   ├── events/
│   │   ├── impl/            # UserRegisteredEvent, UserLoggedInEvent
│   │   └── handlers/        # UserRegisteredHandler, UserLoggedInHandler — сейчас только логируют
│   ├── guards/
│   │   └── jwt-auth.guard.ts     # JwtAuthGuard — проверяет `Authorization: Bearer <JWT>`, кладёт { userId, email } в request.user
│   ├── services/
│   │   └── auth-token.service.ts  # общий для command-хендлеров шаг: issue(user) → { accessToken }
│   └── dto/
│       ├── register.dto.ts # class-validator: email, password (min 8)
│       └── login.dto.ts
└── meeting/             # CQRS; весь контроллер под @UseGuards(JwtAuthGuard) (импортирует AuthModule)
    ├── meeting.module.ts   # imports: [AuthModule]; регистрирует хендлеры (CqrsModule берётся из auth, forRoot не дублируется)
    ├── meeting.controller.ts  # POST /meetings, GET /meetings, GET /meetings/:id — только CommandBus/QueryBus
    ├── commands/
    │   ├── impl/            # CreateMeetingCommand — { title, startsAt }
    │   └── handlers/        # CreateMeetingHandler — prisma.meeting.create + публикует MeetingCreatedEvent
    ├── queries/
    │   ├── impl/            # ListMeetingsQuery, GetMeetingByIdQuery
    │   └── handlers/        # ListMeetingsHandler; GetMeetingByIdHandler — 404 (NotFoundException), если встречи нет
    ├── events/
    │   ├── impl/            # MeetingCreatedEvent
    │   └── handlers/        # MeetingCreatedHandler — сейчас только логирует
    └── dto/
        └── create-meeting.dto.ts  # class-validator: title (IsNotEmpty), startsAt (IsDateString)
test/
├── app.e2e-spec.ts      # e2e
├── auth.e2e-spec.ts     # e2e: register/login
└── meeting.e2e-spec.ts  # e2e: CRUD встреч под Bearer-токеном
```

## Соглашения

- **ESM**: относительные импорты — с расширением `.js` (например `import { AppModule } from './app.module.js'`), даже для `.ts`-файлов. Это обязательно (`nodenext` resolution).
- Стандартная архитектура Nest: модуль → контроллер → сервис; DI через конструктор.
- Новый ресурс — `pnpm exec nest g resource <name>` (schematics в `nest-cli.json`, `sourceRoot: src`).
- Общая библиотека — `pnpm exec nest g library <name>`; path-алиасы из `tsconfig.json` резолвятся в тестах через `vite-tsconfig-paths`.
- `strict: true`, но `strictPropertyInitialization: false` (под DI и декораторы).
- vitest с `globals: true` — `describe/it/expect` без импорта; типы через `types: ["vitest/globals", "node"]`.
- Порт и окружение — из `.env` (`PORT`, `NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`); шаблон — `.env.example`. Загружается через `ConfigModule.forRoot({ isGlobal: true })` в `AppModule`.
- Билд-конфиг для сборки — `tsconfig.build.json`, выход в `dist/` (`deleteOutDir: true`).
- Валидация DTO — глобальный `ValidationPipe` (`class-validator`/`class-transformer`), подключён через `APP_PIPE` в `AppModule` — работает и в реальном приложении, и в e2e-тестах, поднимающих `AppModule` напрямую через `Test.createTestingModule`.
- Пароли — `bcryptjs` (чистый JS, без нативной сборки). JWT — `@nestjs/jwt`, секрет/TTL — из `JWT_SECRET`/`JWT_EXPIRES_IN`.
- Защита эндпоинтов — `JwtAuthGuard` из `auth` (`src/auth/guards/jwt-auth.guard.ts`). Модуль с приватными ресурсами импортирует `AuthModule` (он реэкспортирует `JwtAuthGuard` и `JwtModule`) и вешает `@UseGuards(JwtAuthGuard)` на контроллер. Guard кладёт `{ userId, email }` в `request.user`. Нет заголовка `Authorization: Bearer <JWT>` или токен невалиден → `401`.
- Один `CqrsModule.forRoot()` на приложение (в `AuthModule`, `global: true`). Остальные CQRS-модули (`meeting`) только регистрируют свои хендлеры в `providers` — `explorer` из `@nestjs/cqrs` находит их по всему приложению; повторный `forRoot()` не нужен.
- Prisma — модели в `prisma/schema.prisma`, URL подключения только в `prisma.config.ts` (Prisma 7 запрещает `url` прямо в `datasource` схемы). Клиент подключается через драйвер-адаптер `@prisma/adapter-pg`, а не встроенный rust-движок — так у Prisma 7 по умолчанию.
- **CQRS** (`@nestjs/cqrs`) — паттерн для модулей с бизнес-логикой (сейчас: `auth`, `meeting`). Контроллер не знает о Prisma/бизнес-правилах — только собирает Command/Query из DTO и зовёт `CommandBus`/`QueryBus`. Структура фичи: `commands/{impl,handlers}`, `queries/{impl,handlers}`, `events/{impl,handlers}`, каждая директория с хендлерами экспортирует barrel-массив (`index.ts`) для регистрации в `providers` модуля. Чтение состояния (даже внутри командного хендлера) — через `QueryBus`, не напрямую через Prisma, чтобы у каждой модели чтения был один источник правды. Побочные эффекты после успешной команды — через `EventBus.publish(...)` и `@EventsHandler`, а не напрямую в хендлере команды.

## Актуализация документации

Меняешь архитектуру `api` — обновляй этот файл в том же изменении:

- новый модуль/ресурс верхнего уровня, смена структуры `src/` → раздел «Структура»;
- новые правила по ESM, DI, конфигурации, тестам или изменения `tsconfig`/`nest-cli.json` → раздел «Соглашения»;
- новые/переименованные скрипты или порт → таблица «Команды» (и корневой `CLAUDE.md`, если затронут общий пайплайн);
- новые env-переменные → `.env.example` и раздел «Соглашения».
