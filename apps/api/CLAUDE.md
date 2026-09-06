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
├── schema.prisma       # модели (User, Meeting, MeetingFile) + enum'ы MeetingFileType / MeetingFileStatus
└── migrations/
prisma.config.ts         # datasource url (env DATABASE_URL) — Prisma 7 не читает url из schema.prisma
src/
├── main.ts             # bootstrap, app.enableCors(), app.listen(PORT ?? 3001)
├── app.module.ts       # корневой модуль (ConfigModule, PrismaModule, UsersModule, AuthModule, MeetingModule, MeetingFileModule, global ValidationPipe)
├── app.controller.ts   # GET /
├── app.service.ts
├── app.controller.spec.ts
├── prisma/
│   ├── prisma.module.ts    # @Global, экспортирует PrismaService
│   └── prisma.service.ts   # PrismaClient + PrismaPg-адаптер, $connect/$disconnect по lifecycle
├── users/               # CQRS; владеет сущностью User (Prisma) — создание, поиск и обновление профиля, без токенов/паролей-проверок
│   ├── users.module.ts     # только регистрирует хендлеры в providers; ничего не импортирует/экспортирует —
│   │                       # с auth-модулем связи нет, взаимодействие только через общую CommandBus/QueryBus
│   ├── commands/
│   │   ├── impl/            # CreateUserCommand — { email, passwordHash } (хеш уже посчитан вызывающей стороной);
│   │   │                    # UpdateUserProfileCommand — { userId, name }; UpdateUserPasswordCommand — { userId, passwordHash }; UpdateUserAvatarCommand — { userId, avatarKey }
│   │   └── handlers/        # CreateUserHandler — prisma.user.create; UpdateUserProfileHandler — prisma.user.update (name);
│   │                        # UpdateUserPasswordHandler — prisma.user.update (password), хеш считает auth; UpdateUserAvatarHandler — prisma.user.update (avatarKey)
│   └── queries/
│       ├── impl/            # FindUserByEmailQuery; FindUserByIdQuery — { userId }; FindUserByAvatarKeyQuery — { avatarKey }
│       └── handlers/        # FindUserBy{Email,Id,AvatarKey}Handler — единственные точки чтения User из Prisma (по email / id / ключу аватара)
├── auth/                # CQRS (@nestjs/cqrs) — контроллер не содержит бизнес-логики; отвечает за токены и проверку credentials, не за хранение User
│   ├── auth.module.ts      # CqrsModule.forRoot() + JwtModule.registerAsync + регистрация хендлеров; экспортирует JwtAuthGuard и JwtModule
│   ├── auth.controller.ts  # POST /auth/register, /auth/login — только CommandBus.execute(...)
│   ├── commands/
│   │   ├── impl/            # RegisterCommand, LoginCommand — { email, password };
│   │   │                    # ChangePasswordCommand — { userId, currentPassword, newPassword }
│   │   └── handlers/        # RegisterHandler, LoginHandler — хеширование/сверка пароля (bcryptjs), поиск/создание
│   │                        # User через QueryBus/CommandBus → users-модуль, публикуют события, выпускают токен;
│   │                        # ChangePasswordHandler — читает User (FindUserByIdQuery), сверяет currentPassword
│   │                        # (compare, иначе UnauthorizedException), хеширует новый (hash, 10 rounds),
│   │                        # зовёт UpdateUserPasswordCommand; JWT не отзывает
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
├── storage/             # переиспользуемое файловое хранилище (не CQRS)
│   ├── storage.module.ts        # провайдит и экспортирует FileStorageService; импортируется meeting-file и profile
│   └── file-storage.service.ts  # единственная точка работы с ФС: save/exists/createReadStream/remove, ключ = uuid, mkdir(UPLOADS_DIR) в onModuleInit
├── profile/             # CQRS; ProfileController под @UseGuards(JwtAuthGuard), AvatarController — публичный (импортирует AuthModule)
│   ├── profile.module.ts    # imports: [AuthModule, StorageModule, MulterModule.registerAsync] — limits.fileSize из AVATAR_MAX_UPLOAD_SIZE_BYTES (деф. 5 МиБ, →413), fileFilter по AVATAR_MIME_TO_EXT (→400); регистрирует Command/QueryHandlers
│   ├── profile.controller.ts # GET /users/me, PATCH /users/me, POST /users/me/password (@HttpCode 200, делегирует в ChangePasswordCommand), PUT /users/me/avatar (FileInterceptor('file')) — userId из request.user (JwtAuthGuard)
│   ├── avatar.controller.ts  # публичный (без JwtAuthGuard) GET /users/avatars/:key → StreamableFile с Content-Type из расширения ключа
│   ├── avatar-mime.ts        # AVATAR_MIME_TO_EXT (image/jpeg→jpg, image/png→png, image/webp→webp) + обратная AVATAR_EXT_TO_MIME
│   ├── commands/
│   │   ├── impl/            # UploadAvatarCommand { userId, file: { mimetype, buffer } }
│   │   └── handlers/        # UploadAvatarHandler — пишет <uuid>.<ext> в storage, UpdateUserAvatarCommand, стирает прежний файл; при ошибке убирает свежий; возвращает ProfileDto
│   ├── queries/
│   │   ├── impl/            # GetProfileQuery { userId }; GetAvatarContentQuery { key }
│   │   └── handlers/        # GetProfileHandler — читает User через QueryBus(FindUserByIdQuery), собирает ProfileDto;
│   │                        # GetAvatarContentHandler — { stream, mimeType }; 404, если расширение неизвестно / нет User с таким avatarKey / бинарника нет на диске
│   └── dto/
│       ├── profile.dto.ts          # форма ответа { id, email, name, avatarUrl, createdAt } + toProfileDto (avatarUrl = avatarKey ? '/users/avatars/'+avatarKey : null)
│       ├── update-profile-name.dto.ts # class-validator: name — @Transform trim + @Length(1, 50)
│       ├── change-password.dto.ts  # class-validator: currentPassword @IsNotEmpty, newPassword @MinLength(8) — как RegisterDto
│       ├── uploaded-avatar-part.ts # узкий тип части multipart аватара { mimetype, buffer } (без @types/multer)
│       └── avatar-content.ts       # тело ответа GetAvatarContentQuery { stream, mimeType }
├── meeting/             # CQRS; весь контроллер под @UseGuards(JwtAuthGuard) (импортирует AuthModule)
│   ├── meeting.module.ts   # imports: [AuthModule]; регистрирует хендлеры (CqrsModule берётся из auth, forRoot не дублируется)
│   ├── meeting.controller.ts  # POST /meetings, GET /meetings, GET /meetings/:id — только CommandBus/QueryBus
│   ├── commands/
│   │   ├── impl/            # CreateMeetingCommand — { title, startsAt }
│   │   └── handlers/        # CreateMeetingHandler — prisma.meeting.create + публикует MeetingCreatedEvent
│   ├── queries/
│   │   ├── impl/            # ListMeetingsQuery, GetMeetingByIdQuery
│   │   └── handlers/        # ListMeetingsHandler; GetMeetingByIdHandler — 404 (NotFoundException), если встречи нет
│   ├── events/
│   │   ├── impl/            # MeetingCreatedEvent
│   │   └── handlers/        # MeetingCreatedHandler — сейчас только логирует
│   └── dto/
│       └── create-meeting.dto.ts  # class-validator: title (IsNotEmpty), startsAt (IsDateString)
└── meeting-file/        # CQRS; вложенный ресурс /meetings/:meetingId/files, контроллер под @UseGuards(JwtAuthGuard)
    ├── meeting-file.module.ts    # imports: [AuthModule, StorageModule, MulterModule.registerAsync] — limits.fileSize из MAX_UPLOAD_SIZE_BYTES (→413), fileFilter по allowed-mime (→400)
    ├── meeting-file.controller.ts # POST /  ·  GET /  ·  GET /:fileId/content (StreamableFile)  ·  POST /:fileId/reprocess (200)  ·  DELETE /:fileId
    ├── allowed-mime.ts           # ALLOWED_UPLOAD_MIME_TYPES — белый список mime (единый на recording/attachment)
    ├── attachment-disposition.ts # attachmentDisposition(name) — значение Content-Disposition: filename* (UTF-8) + ASCII-фолбэк
    ├── processing/
    │   ├── stt.service.ts        # токен STT_SERVICE + StubSttService — единственная детерминированная заглушка
    │   │                         # (транскрипт из метаданных, без ветвлений); путь ошибки STT в e2e — через .overrideProvider
    │   └── meeting-file-processing.queue.ts # in-process воркер (concurrency 1): pending→processing→done|failed + transcriptText;
    │                             # OnModuleDestroy гасит очередь (иначе e2e с app.close() «догорают»); P2025 при DELETE — молча
    ├── commands/
    │   ├── impl/            # CreateMeetingFileCommand { meetingId, type, file }, DeleteMeetingFileCommand / ReprocessMeetingFileCommand { meetingId, fileId }
    │   └── handlers/        # CreateMeetingFileHandler — 404 через QueryBus(GetMeetingByIdQuery), запись файла + prisma.meetingFile.create,
    │                        # для recording publish MeetingFileProcessingRequestedEvent;
    │                        # DeleteMeetingFileHandler — 404 через QueryBus(GetMeetingFileQuery), delete (транскрипт — та же строка) + storage.remove;
    │                        # ReprocessMeetingFileHandler — атомарный updateMany failed→pending (count 0 → 409), publish события
    ├── queries/
    │   ├── impl/            # ListMeetingFilesQuery { meetingId }, GetMeetingFileQuery / GetMeetingFileContentQuery { meetingId, fileId }
    │   └── handlers/        # ListMeetingFilesHandler; GetMeetingFileHandler — единственная точка чтения одной записи MeetingFile (404);
    │                        # GetMeetingFileContentHandler — { stream, mimeType, originalName }, 404 и если бинарник пропал с диска
    ├── events/
    │   ├── impl/            # MeetingFileProcessingRequestedEvent { fileId } — «файлу нужна фоновая обработка»
    │   └── handlers/        # MeetingFileProcessingRequestedHandler — безусловно кладёт файл в MeetingFileProcessingQueue
    └── dto/
        ├── upload-meeting-file.dto.ts  # class-validator: type ∈ Object.values(MeetingFileType)
        ├── uploaded-file-part.ts       # локальный тип части multipart (без @types/multer)
        ├── meeting-file-content.ts     # тело ответа GET :fileId/content (поток + заголовки)
        └── meeting-file.dto.ts         # форма ответа (без storageKey) + toMeetingFileDto(prisma → dto)
test/
├── app.e2e-spec.ts          # e2e
├── auth.e2e-spec.ts         # e2e: register/login
├── meeting.e2e-spec.ts      # e2e: CRUD встреч под Bearer-токеном
├── meeting-files.e2e-spec.ts # e2e: загрузка/список/скачивание/удаление; отказы 401/413/400/404; фоновая обработка recording (pending→done + транскрипт), reprocess (200 только для failed, иначе 409); сквозной сценарий пути UI одним прогоном
├── profile.e2e-spec.ts      # e2e: GET/PATCH /users/me под Bearer-токеном; 401 без токена; PATCH — 400 для пустого (после trim) и >50 символов имени без изменения в БД; POST /users/me/password — смена по верному currentPassword (login по старому → 401, по новому → 200), неверный currentPassword → 401 без изменения (тест допускает 400/401), короткий newPassword → 400, старый accessToken после смены остаётся валиден
└── profile-avatar.e2e-spec.ts # e2e: PUT /users/me/avatar — 401 без токена, 200 + avatarUrl для image/* ≤ лимита, 413 сверх AVATAR_MAX_UPLOAD_SIZE_BYTES, 400 для не-image (аватар не меняется); публичный GET /users/avatars/:key отдаёт бинарник с его mime, 404 для неизвестного ключа; повторная загрузка меняет avatarUrl, прежний URL → 404
```

## Соглашения

- **ESM**: относительные импорты — с расширением `.js` (например `import { AppModule } from './app.module.js'`), даже для `.ts`-файлов. Это обязательно (`nodenext` resolution).
- Стандартная архитектура Nest: модуль → контроллер → сервис; DI через конструктор.
- Новый ресурс — `pnpm exec nest g resource <name>` (schematics в `nest-cli.json`, `sourceRoot: src`).
- Общая библиотека — `pnpm exec nest g library <name>`; path-алиасы из `tsconfig.json` резолвятся в тестах через `vite-tsconfig-paths`.
- `strict: true`, но `strictPropertyInitialization: false` (под DI и декораторы).
- vitest с `globals: true` — `describe/it/expect` без импорта; типы через `types: ["vitest/globals", "node"]`.
- Порт и окружение — из `.env` (`PORT`, `NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `UPLOADS_DIR`, `MAX_UPLOAD_SIZE_BYTES`, `AVATAR_MAX_UPLOAD_SIZE_BYTES`); шаблон — `.env.example`. Загружается через `ConfigModule.forRoot({ isGlobal: true })` в `AppModule`. Читать конфиг только через `ConfigService`, не `process.env` напрямую.
- CORS включён глобально в `main.ts` (`app.enableCors()`, все источники) — чтобы `apps/web` (порт 3000) ходил в API из браузера.
- Билд-конфиг для сборки — `tsconfig.build.json`, выход в `dist/` (`deleteOutDir: true`).
- Валидация DTO — глобальный `ValidationPipe` (`class-validator`/`class-transformer`), подключён через `APP_PIPE` в `AppModule` — работает и в реальном приложении, и в e2e-тестах, поднимающих `AppModule` напрямую через `Test.createTestingModule`.
- Пароли — `bcryptjs` (чистый JS, без нативной сборки). JWT — `@nestjs/jwt`, секрет/TTL — из `JWT_SECRET`/`JWT_EXPIRES_IN`.
- Защита эндпоинтов — `JwtAuthGuard` из `auth` (`src/auth/guards/jwt-auth.guard.ts`). Модуль с приватными ресурсами импортирует `AuthModule` (он реэкспортирует `JwtAuthGuard` и `JwtModule`) и вешает `@UseGuards(JwtAuthGuard)` на контроллер. Guard кладёт `{ userId, email }` в `request.user`. Нет заголовка `Authorization: Bearer <JWT>` или токен невалиден → `401`.
- Один `CqrsModule.forRoot()` на приложение (в `AuthModule`, `global: true`). Остальные CQRS-модули (`meeting`, `meeting-file`, `users`, `profile`) только регистрируют свои хендлеры в `providers` — `explorer` из `@nestjs/cqrs` находит их по всему приложению; повторный `forRoot()` не нужен.
- Prisma — модели в `prisma/schema.prisma`, URL подключения только в `prisma.config.ts` (Prisma 7 запрещает `url` прямо в `datasource` схемы). Клиент подключается через драйвер-адаптер `@prisma/adapter-pg`, а не встроенный rust-движок — так у Prisma 7 по умолчанию.
- **Профиль пользователя (`profile`)**. `User.name` (nullable) и `User.avatarKey` (nullable, ключ файла аватара `<uuid>.<ext>`) — поля Prisma-модели `User`. `GET /users/me` / `PATCH /users/me` / `POST /users/me/password` / `PUT /users/me/avatar` отдают/меняют профиль текущего пользователя (`request.user.userId` из `JwtAuthGuard`); `profile` не хранит своих Prisma-моделей — чтение/запись `User` только через `users` (`FindUserByIdQuery` / `FindUserByAvatarKeyQuery` / `UpdateUserProfileCommand` / `UpdateUserPasswordCommand` / `UpdateUserAvatarCommand`). Ответ (`ProfileDto`) собирает `GetProfileHandler`: `avatarUrl = avatarKey ? '/users/avatars/' + avatarKey : null`. `PATCH` принимает `{ name }` (`UpdateProfileNameDto`: `@Transform` trim + `@Length(1, 50)` — пустая после trim строка или длина > 50 → `400`, значение в БД не меняется). `POST /users/me/password` `{ currentPassword, newPassword }` (`ChangePasswordDto`: `currentPassword` `@IsNotEmpty`, `newPassword` `@MinLength(8)`) — контроллер только делегирует в `ChangePasswordCommand` (модуль `auth`: сверка старого пароля и хеширование нового — `bcryptjs`), при успехе `200` с пустым телом; неверный `currentPassword` → `401`, короткий `newPassword` → `400`. Смена пароля **не отзывает** ранее выданный JWT — старый `accessToken` продолжает работать.
- **Аватар (`profile`)**. `PUT /users/me/avatar` — multipart-поле `file`, `FileInterceptor('file')` + `MulterModule.registerAsync` в `ProfileModule` (memoryStorage; `limits.fileSize` из `AVATAR_MAX_UPLOAD_SIZE_BYTES` — отдельная от файлов встреч переменная, деф. 5 МиБ → `413`; `fileFilter` по `AVATAR_MIME_TO_EXT` = `image/jpeg|image/png|image/webp` → `400`). Порядок отказов: `JwtAuthGuard` (401) → multer `limits`/`fileFilter` (413 сверх лимита / 400 не-image) → хендлер (для публичной отдачи по ключу — 404 на неизвестный/заменённый `key`). `UploadAvatarHandler` пишет бинарник ключом `<randomUUID>.<ext>` (mime нигде в БД не хранится — восстанавливается из расширения при отдаче), зовёт `UpdateUserAvatarCommand`, затем `storage.remove` прежнего файла; при ошибке обновления убирает только что записанный файл (нет «сирот»). Публичная отдача — отдельный `AvatarController` **без** `JwtAuthGuard`: `GET /users/avatars/:key` → `StreamableFile` с `Content-Type` из `AVATAR_EXT_TO_MIME`; `GetAvatarContentHandler` даёт `404`, если расширение не из белого списка, нет `User` с таким `avatarKey` (ключ неизвестен/заменён) или бинарника нет на диске. Осознанно доверяем `Content-Type` клиента (детект содержимого не делаем).
- **CQRS** (`@nestjs/cqrs`) — паттерн для модулей с бизнес-логикой (сейчас: `auth`, `users`, `meeting`, `meeting-file`, `profile`). Контроллер не знает о Prisma/бизнес-правилах — только собирает Command/Query из DTO и зовёт `CommandBus`/`QueryBus`. Структура фичи: `commands/{impl,handlers}`, `queries/{impl,handlers}`, `events/{impl,handlers}` (если есть), каждая директория с хендлерами экспортирует barrel-массив (`index.ts`) для регистрации в `providers` модуля. Чтение состояния (даже внутри командного хендлера) — через `QueryBus`, не напрямую через Prisma, чтобы у каждой модели чтения был один источник правды. Побочные эффекты после успешной команды — через `EventBus.publish(...)` и `@EventsHandler`, а не напрямую в хендлере команды.
- **Границы модулей `auth`/`users`**: `auth` не хранит и не читает `User` напрямую через Prisma — только через `CommandBus.execute(new CreateUserCommand(...))` / `QueryBus.execute(new FindUserByEmailQuery(...))`, объявленные в `users`. `users` не импортирует `auth` и ничего не знает про пароли/JWT — принимает уже готовый `passwordHash` (и при регистрации, и при смене пароля через `UpdateUserPasswordCommand`). Хеширование (`bcryptjs`) и сверка пароля — ответственность `auth` (`RegisterHandler`/`LoginHandler`/`ChangePasswordHandler`). Ни один из модулей не импортирует другой явно (`AppModule` подключает оба независимо) — связь только через общую CQRS-шину, это и есть механизм их взаимодействия.
- **Файловое хранилище (`storage`)**. `FileStorageService` (`src/storage/`) — единственная точка работы с ФС для любых загруженных бинарников (файлы встречи, аватары): `save` / `exists` / `createReadStream` / `remove` поверх плоской раскладки `${UPLOADS_DIR}/${storageKey}`, `storageKey` задаёт вызывающая сторона (`randomUUID`, для аватара — `<randomUUID>.<ext>` → пользовательский ввод в путь не попадает, нет path traversal), каталог создаётся в `onModuleInit`. Провайдится и экспортируется через `StorageModule`, который импортируют и `meeting-file`, и `profile` — не дублировать провайдер и не работать с `fs` в хендлерах.
- **Хранение файлов встречи (`meeting-file`)**. Бинарники — на диске в `UPLOADS_DIR` (плоско, имя = случайный uuid = `storageKey`), в БД (`meeting_files`) — только метаданные и `storageKey`. Работа с ФС — только через `FileStorageService` из `StorageModule` (не в хендлерах). Приём — `FileInterceptor('file')` + `MulterModule.registerAsync` (memoryStorage: буфер в памяти, ограничен `MAX_UPLOAD_SIZE_BYTES`; запись на диск — в командном хендлере после проверки встречи, чтобы не плодить «сирот» при 404/400). Порядок отказов: `JwtAuthGuard` (401) → multer `limits`/`fileFilter` (413/400) → хендлер `GetMeetingByIdQuery` (404). Осознанные ограничения этой итерации: доверяем `Content-Type` клиента (детект содержимого/антивирус не делаем); при `onDelete: Cascade` удаление встречи оставит бинарники-сироты на диске (удаление встреч в скоуп фичи не входит); durability очереди/файлов после рестарта не гарантируется; при нескольких инстансах API каталог не общий. Не-ASCII имя файла из multipart перекодируется `latin1 → utf8` в контроллере; отдача — `StreamableFile` с `Content-Disposition` по RFC 5987.
- **Фоновая обработка записи (`meeting-file/processing`)**. Оба входа в очередь идут через одно событие `MeetingFileProcessingRequestedEvent { fileId }`: `CreateMeetingFileHandler` публикует его для только что загруженной `recording` (решение «нужна ли обработка» — здесь, у издателя), `ReprocessMeetingFileHandler` — после успешного сброса статуса. `MeetingFileProcessingRequestedHandler` безусловно кладёт `fileId` в `MeetingFileProcessingQueue` — in-process воркер без внешнего брокера (`concurrency = 1`), ведёт `pending → processing → done|failed` и по успеху пишет `transcriptText` в ту же строку. `SttService` (токен `STT_SERVICE`) — единственная реализация `StubSttService`: транскрипт детерминированно выводится из метаданных файла (без чтения содержимого, без ветвления по `NODE_ENV` — локальный pre-commit идёт с `development`). Путь ошибки STT в e2e задаётся через `.overrideProvider(STT_SERVICE)` (двойник падает по маркеру `__stt_fail__` в имени) — в проде тестовых веток нет. `POST /meetings/:id/files/:fileId/reprocess` — атомарный `updateMany({ where: { status: failed }, data: { status: pending, transcriptText: null } })`; `count === 0` → `409 Conflict` (гонка/не тот статус не приводит к двойной постановке в очередь), иначе публикуется событие. `DELETE` уносит транскрипт вместе со строкой; если файл в этот момент в обработке — воркер ловит `P2025` и молча останавливается. `MeetingFileProcessingQueue` реализует `OnModuleDestroy` (флаг остановки + `await` текущей задачи) — иначе e2e с `app.close()` в `afterEach` «догорают» и пишут в закрытый `PrismaClient`. Durability между рестартами не гарантируется: зависшие `pending`/`processing` не возобновляются.
- **E2e и файлы на диске**. `test/meeting-files.e2e-spec.ts` в `beforeAll` подменяет `process.env.UPLOADS_DIR` на временный каталог (`os.tmpdir()`) и удаляет его в `afterAll`, а `MAX_UPLOAD_SIZE_BYTES` ставит маленьким — чтобы дёшево проверить 413 и не мусорить в рабочем `uploads/`. `@nestjs/config` не перетирает уже заданные `process.env`, поэтому подмену делаем до импорта `AppModule` (динамический `import()` в `beforeEach`).

## Актуализация документации

Меняешь архитектуру `api` — обновляй этот файл в том же изменении:

- новый модуль/ресурс верхнего уровня, смена структуры `src/` → раздел «Структура»;
- новые правила по ESM, DI, конфигурации, тестам или изменения `tsconfig`/`nest-cli.json` → раздел «Соглашения»;
- новые/переименованные скрипты или порт → таблица «Команды» (и корневой `CLAUDE.md`, если затронут общий пайплайн);
- новые env-переменные → `.env.example` и раздел «Соглашения».
