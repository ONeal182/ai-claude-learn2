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

Prisma-команды, схема, миграции и правила доступа — в [`.claude/rules/prisma.md`](../../.claude/rules/prisma.md).

## Модули

Сквозные правила — ниже в «Соглашениях». Модуль с нетривиальным поведением держит свою логику
(структуру + правила) в собственном `src/<module>/CLAUDE.md`; здесь — одна строка и ссылка.

| Модуль             | Что делает                                                                                          | Документирован                                        |
| ------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `src/prisma/`      | `@Global` `PrismaService` (PrismaClient + PrismaPg-адаптер, `$connect`/`$disconnect` по lifecycle) | [`.claude/rules/prisma.md`](../../.claude/rules/prisma.md) |
| `src/auth/`        | CQRS; токены и проверка credentials, **не** хранение `User`; `JwtAuthGuard`, `AuthTokenService`, события | здесь                                          |
| `src/users/`       | CQRS; владелец сущности `User` (Prisma) — создание, поиск, обновление профиля; без паролей/токенов | здесь                                                |
| `src/storage/`     | не CQRS; `FileStorageService` — единственная точка работы с ФС для всех загруженных бинарников      | здесь                                                |
| `src/meeting/`     | CQRS; CRUD встреч под `JwtAuthGuard`, событие `MeetingCreatedEvent`                                 | здесь                                                |
| `src/profile/`     | CQRS; `GET`/`PATCH /users/me`, `PUT /users/me/avatar`, публичный `GET /users/avatars/:key`          | [`src/profile/CLAUDE.md`](src/profile/CLAUDE.md)       |
| `src/meeting-file/`| CQRS; вложенный `/meetings/:id/files`, загрузка на диск, фоновая обработка записи (STT-заглушка)     | [`src/meeting-file/CLAUDE.md`](src/meeting-file/CLAUDE.md) |

## Структура

```
prisma/
├── schema.prisma       # модели (User, Meeting, MeetingFile) + enum'ы MeetingFileType / MeetingFileStatus
└── migrations/
prisma.config.ts         # datasource url (env DATABASE_URL) — Prisma 7 не читает url из schema.prisma
src/
├── main.ts             # bootstrap, app.enableCors(), app.listen(PORT ?? 3001)
├── app.module.ts       # корневой модуль (ConfigModule, PrismaModule, UsersModule, AuthModule, MeetingModule, MeetingFileModule, ProfileModule, global ValidationPipe)
├── app.controller.ts   # GET /
├── prisma/
│   ├── prisma.module.ts    # @Global, экспортирует PrismaService
│   └── prisma.service.ts   # PrismaClient + PrismaPg-адаптер, $connect/$disconnect по lifecycle
├── users/              # CQRS; владеет сущностью User — создание, поиск, обновление профиля, без токенов/проверок пароля
│   ├── users.module.ts     # только регистрирует хендлеры; с auth связи нет — взаимодействие через общую CommandBus/QueryBus
│   ├── commands/           # CreateUserCommand { email, passwordHash }; UpdateUserProfileCommand { userId, name };
│   │                       # UpdateUserAvatarCommand { userId, avatarKey } → prisma.user.create / update
│   └── queries/            # FindUserBy{Email,Id,AvatarKey}Query — единственные точки чтения User из Prisma
├── auth/               # CQRS; контроллер без бизнес-логики; токены и проверка credentials, не хранение User
│   ├── auth.module.ts      # CqrsModule.forRoot() + JwtModule.registerAsync + хендлеры; экспортирует JwtAuthGuard и JwtModule
│   ├── auth.controller.ts  # POST /auth/register, /auth/login — только CommandBus.execute(...)
│   ├── commands/           # RegisterCommand, LoginCommand { email, password } — хеш/сверка пароля (bcryptjs),
│   │                       # поиск/создание User через шину → users, публикация событий, выпуск токена
│   ├── events/             # UserRegisteredEvent, UserLoggedInEvent — хендлеры сейчас только логируют
│   ├── guards/jwt-auth.guard.ts        # проверяет `Authorization: Bearer <JWT>`, кладёт { userId, email } в request.user
│   ├── services/auth-token.service.ts  # issue(user) → { accessToken }
│   └── dto/                # register.dto.ts (email, password min 8), login.dto.ts
├── storage/            # переиспользуемое файловое хранилище (не CQRS)
│   ├── storage.module.ts        # провайдит и экспортирует FileStorageService; импортируется meeting-file и profile
│   └── file-storage.service.ts  # save/exists/createReadStream/remove, ключ = uuid, mkdir(UPLOADS_DIR) в onModuleInit
├── profile/            # → src/profile/CLAUDE.md
├── meeting/            # CQRS; весь контроллер под @UseGuards(JwtAuthGuard) (импортирует AuthModule)
│   ├── meeting.module.ts      # imports: [AuthModule]; хендлеры (CqrsModule берётся из auth, forRoot не дублируется)
│   ├── meeting.controller.ts  # POST /meetings, GET /meetings, GET /meetings/:id — только CommandBus/QueryBus
│   ├── commands/              # CreateMeetingCommand { title, startsAt } → prisma.meeting.create + MeetingCreatedEvent
│   ├── queries/              # ListMeetingsQuery; GetMeetingByIdQuery — 404, если встречи нет
│   ├── events/               # MeetingCreatedEvent — хендлер сейчас только логирует
│   └── dto/create-meeting.dto.ts  # class-validator: title (IsNotEmpty), startsAt (IsDateString)
└── meeting-file/       # → src/meeting-file/CLAUDE.md
test/
├── app.e2e-spec.ts
├── auth.e2e-spec.ts            # register/login
├── meeting.e2e-spec.ts         # CRUD встреч под Bearer-токеном
├── meeting-files.e2e-spec.ts   # → src/meeting-file/CLAUDE.md
├── profile.e2e-spec.ts         # → src/profile/CLAUDE.md
└── profile-avatar.e2e-spec.ts  # → src/profile/CLAUDE.md
```

## Правила (`.claude/rules/`)

Детальные сквозные правила вынесены в focused-файлы (автозагрузкой не подхватываются — читать по ссылке):

- [`esm.md`](../../.claude/rules/esm.md) — чистый ESM, `.js` в импортах
- [`cqrs.md`](../../.claude/rules/cqrs.md) — раскладка модуля, шина, события
- [`prisma.md`](../../.claude/rules/prisma.md) — Prisma 7, схема, миграции, доступ
- [`auth.md`](../../.claude/rules/auth.md) — JWT-guard, защита эндпоинтов, границы `auth`↔`users`
- [`file-upload.md`](../../.claude/rules/file-upload.md) — multer, порядок отказов, отдача файлов
- [`testing.md`](../../.claude/rules/testing.md) — vitest, e2e, стабы, подмена env
- [`env.md`](../../.claude/rules/env.md) — новая переменная = 3 места

## Соглашения

Здесь — только сквозные правила. Поведение конкретного модуля — в его `src/<module>/CLAUDE.md`.

- **ESM** — чистый ESM (`"type": "module"`, `nodenext`); относительные импорты с расширением `.js` даже для `.ts`. Правила и чек-лист: [`.claude/rules/esm.md`](../../.claude/rules/esm.md).
- Стандартная архитектура Nest: модуль → контроллер → сервис; DI через конструктор.
- Каждый метод сервиса: явные TS-типы всех параметров и возвращаемого значения (`Promise<T>`); без `console.log` — `Logger` из `@nestjs/common`; имена переменных по смыслу, не `x` / `data` / `result`.
- Новый ресурс — `pnpm exec nest g resource <name>` (schematics в `nest-cli.json`, `sourceRoot: src`).
- Общая библиотека — `pnpm exec nest g library <name>`; path-алиасы из `tsconfig.json` резолвятся в тестах через `vite-tsconfig-paths`.
- `strict: true`, но `strictPropertyInitialization: false` (под DI и декораторы).
- Тесты (vitest, `*.spec.ts` / `test/*.e2e-spec.ts`, `globals: true`, e2e через `Test.createTestingModule`, `.overrideProvider`, подмена env до динамического импорта) — [`.claude/rules/testing.md`](../../.claude/rules/testing.md).
- Окружение — переменные из `.env` (шаблон `.env.example`), читать только через `ConfigService`, не `process.env`. Новая переменная = 3 места: [`.claude/rules/env.md`](../../.claude/rules/env.md).
- CORS включён глобально в `main.ts` (`app.enableCors()`, все источники) — чтобы `apps/web` (порт 3000) ходил в API из браузера.
- Билд-конфиг для сборки — `tsconfig.build.json`, выход в `dist/` (`deleteOutDir: true`).
- Валидация DTO — глобальный `ValidationPipe` (`class-validator`/`class-transformer`), подключён через `APP_PIPE` в `AppModule` — работает и в реальном приложении, и в e2e-тестах, поднимающих `AppModule` напрямую через `Test.createTestingModule`.
- Аутентификация — JWT bearer, пароли `bcryptjs`, `@nestjs/jwt`. Защита эндпоинта (`imports: [AuthModule]` → `@UseGuards(JwtAuthGuard)` → `request.user.userId`), публичный контроллер, границы `auth`↔`users`: [`.claude/rules/auth.md`](../../.claude/rules/auth.md).
- Один `CqrsModule.forRoot()` на приложение (в `AuthModule`, `global: true`). Остальные CQRS-модули (`meeting`, `meeting-file`, `users`, `profile`) только регистрируют свои хендлеры в `providers` — `explorer` из `@nestjs/cqrs` находит их по всему приложению; повторный `forRoot()` не нужен.
- Prisma — все правила (Prisma 7, драйвер-адаптер `@prisma/adapter-pg`, `url` только в `prisma.config.ts`, доступ только из CQRS-хендлеров) в [`.claude/rules/prisma.md`](../../.claude/rules/prisma.md).
- **CQRS** (`@nestjs/cqrs`) — паттерн для модулей с бизнес-логикой (`auth`, `users`, `meeting`, `meeting-file`, `profile`): контроллер без логики, чтение через `QueryBus`, эффекты через `EventBus`, раскладка `commands|queries|events/{impl,handlers}` + barrel `index.ts`. Полные правила: [`.claude/rules/cqrs.md`](../../.claude/rules/cqrs.md).
- **Границы модулей `auth`/`users`** — `auth` не трогает Prisma `User` напрямую, только через команды/запросы `users`; `users` не знает про пароли/JWT (принимает готовый `passwordHash`). Ни один не импортирует другой — связь через CQRS-шину. Подробнее — [`.claude/rules/auth.md`](../../.claude/rules/auth.md).
- **Файловое хранилище (`storage`)** — `FileStorageService` (`src/storage/`), единственная точка работы с ФС для любых загруженных бинарников: `save` / `exists` / `createReadStream` / `remove` поверх `${UPLOADS_DIR}/${storageKey}`, каталог создаётся в `onModuleInit`. Провайдится через `StorageModule` (импортируют `meeting-file` и `profile`) — не дублировать провайдер, не трогать `fs` в хендлерах. Правила загрузки (multer, порядок отказов 401→413/400→404, запись после валидации, отдача): [`.claude/rules/file-upload.md`](../../.claude/rules/file-upload.md).
- **Новый модуль с нетривиальной логикой** → заведи `src/<module>/CLAUDE.md` (структура модуля + его правила), а в этом файле оставь только строку в таблице «Модули» со ссылкой.

## Актуализация документации

Меняешь архитектуру `api` — обновляй документацию в том же изменении:

- новый модуль верхнего уровня или смена структуры `src/` → таблица «Модули» и раздел «Структура» здесь; если у модуля нетривиальная логика — заведи `src/<module>/CLAUDE.md` и держи её там;
- изменилось поведение модуля, у которого есть свой `CLAUDE.md` → правь тот файл, не этот;
- новые правила по ESM, DI, конфигурации, тестам, аутентификации, загрузке файлов → соответствующий файл в `.claude/rules/` (и строка в списке «Правила», если файл новый); мелкие правила без своего файла → раздел «Соглашения»;
- новые/переименованные скрипты или порт → таблица «Команды» (и корневой `CLAUDE.md`, если затронут общий пайплайн);
- новые env-переменные → `.env.example` и раздел «Соглашения».
