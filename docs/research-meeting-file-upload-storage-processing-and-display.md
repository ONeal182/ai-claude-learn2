# Research: research-meeting-file-upload-storage-processing-and-display

**План:** plan/plan-meeting-file-upload-storage-processing-and-display.md
**PRD:** @docs/prd-meeting-file-upload-storage-processing-and-display.md
**Дата:** 2026-09-02

---

## Контекст из документации проекта

Ограничения и соглашения, которые напрямую определяют технические решения плана:

- **Чистый ESM, относительные импорты с `.js`** — `apps/api/CLAUDE.md:95` (`nodenext` resolution). Любой новый файл в `apps/api` импортируется как `./foo.js`, даже если это `.ts`. Новые npm-пакеты обязаны иметь рабочий ESM-выход.
- **Prisma 7, драйвер-адаптер `@prisma/adapter-pg`, без rust-движка** — `apps/api/CLAUDE.md:108`, `apps/api/src/prisma/prisma.service.ts:9-12`. URL подключения только в `prisma.config.ts`, не в схеме (`apps/api/prisma.config.ts`). Модели — `cuid()` id + `@@map("...")`, `createdAt/updatedAt`; enum'ов в схеме ещё нет (`apps/api/prisma/schema.prisma`).
- **Один `CqrsModule.forRoot()` на приложение** (в `AuthModule`, `global: true`) — `apps/api/CLAUDE.md:107`. Новый модуль только регистрирует свои хендлеры в `providers`, `forRoot()` не дублирует (как `meeting`, `apps/api/src/meeting/meeting.module.ts:11`).
- **CQRS-контракт**: контроллер не знает о Prisma, только собирает Command/Query и зовёт шину; чтение состояния (даже внутри командного хендлера) — через `QueryBus`; побочные эффекты после успешной команды — через `EventBus.publish(...)` + `@EventsHandler`, не в теле хендлера — `apps/api/CLAUDE.md:109`. Структура фичи: `commands/{impl,handlers}`, `queries/{impl,handlers}`, `events/{impl,handlers}`, в каждой папке хендлеров barrel-`index.ts`.
- **Все приватные эндпоинты — под `JwtAuthGuard`**: модуль импортирует `AuthModule` (реэкспортит `JwtAuthGuard` + `JwtModule`), контроллер под `@UseGuards(JwtAuthGuard)` — `apps/api/CLAUDE.md:106`, `apps/api/src/meeting/meeting.controller.ts:10-11`. Нет/битый токен → 401 автоматически.
- **Глобальный `ValidationPipe({ whitelist: true, transform: true })`** через `APP_PIPE` — `apps/api/src/app.module.ts:22-25`. Работает и в e2e, поднимающих `AppModule` напрямую. 404 для несуществующей сущности — `NotFoundException` в query-хендлере (`apps/api/src/meeting/queries/handlers/get-meeting-by-id.handler.ts:13-17`).
- **E2e**: vitest, `include: ['**/*.e2e-spec.ts']` (`apps/api/vitest.config.e2e.ts:9`), **реальный Postgres**, без глобального setup-файла. Каждый спек в `beforeEach` поднимает `AppModule` через `Test.createTestingModule` и в `afterEach` делает `app.close()` (`apps/api/test/meeting.e2e-spec.ts:44-61`). БД между тестами **не чистится** — изоляция через уникальные данные (`uniqueEmail()`, отдельная встреча на тест).
- **E2e и `prisma migrate deploy` гоняются в CI и в pre-commit хуке** — корневой `CLAUDE.md` (раздел «Соглашения», Husky), `.github/workflows/ci.yml`. Миграция новой таблицы обязана быть в коммите. **`NODE_ENV` расходится**: CI ставит `NODE_ENV=test` (`.github/workflows/ci.yml`), локальный `apps/api/.env` — `NODE_ENV=development`. Значит переключать поведение (заглушку STT) по `NODE_ENV=test` **нельзя** — локальный pre-commit это не подхватит.
- **`.gitignore`**: игнорит `.env*` (кроме `.env.example`), `dist/`, `coverage/`. **`uploads/` не игнорируется** — каталог с бинарниками нужно добавить в `.gitignore` явно. Отдельного `apps/api/.gitignore` нет.
- **`docker-compose.yml` содержит только сервис `postgres`** — контейнера `api` в компоузе нет. Требование PRD «том uploads в docker-compose для контейнера API» подвесить не на что (см. «Открытые вопросы»).
- **CORS**: `app.enableCors()` без опций (`apps/api/src/main.ts:6`) — кастомные заголовки ответа в браузер не пробрасываются (нет `Access-Control-Expose-Headers`).
- **multer уже есть транзитивно** — `node_modules/.pnpm/multer@2.2.0` как зависимость `@nestjs/platform-express`; `FileInterceptor` доступен из `@nestjs/platform-express` без новых зависимостей. **`@types/multer` не установлен** — глобальный тип `Express.Multer.File` недоступен.
- **Web**: App Router, серверные компоненты по умолчанию, `"use client"` точечно; алиас `@/*` → `src/*` (`apps/web/CLAUDE.md:38-40`). HeroUI v3 — compound-компоненты, обработчики `onPress` (`apps/web/CLAUDE.md:41`). Тёмная тема по классу `.dark` на `<html>` (`apps/web/CLAUDE.md:42`).
- **Web-данные**: токен в `localStorage` (`apps/web/src/lib/session.ts`), поэтому все страницы с данными — клиентские. HTTP инкапсулирован в `src/lib/api.ts` поверх `fetch`, ошибки — `ApiError { status, messages }`, `status === 0` = сеть недоступна (`apps/web/CLAUDE.md:67`, `apps/web/src/lib/api.ts:18-61`). Блок «fetch → parse → `!ok` → `ApiError`» в `getMeetings` продублирован (`apps/web/src/lib/api.ts:83-105`).
- **Защита страниц** — целиком клиентская: `useEffect` при монтировании читает `getSession()`, нет сессии → `router.replace('/login')`; ответ `401` → `clearSession()` + `/login`; запросы гасятся флагом `cancelled` (`apps/web/src/components/dashboard.tsx:73-110`). Страница `/` рендерит `<Dashboard/>`; `login`/`register` аналогично — `page.tsx` — тонкая обёртка над клиентским компонентом из `src/components/`.
- **HeroUI v3 (проверено `list_components.mjs`, v3.0.5)**: есть `ProgressBar`, `ProgressCircle`, `Disclosure` + `DisclosureGroup`, `Chip`, `Alert`, `Table`, `Spinner`, `Card`, `Button`. **Компонента для drag-n-drop / загрузки файла нет** — зону загрузки собираем на нативном `<input type="file">` + DnD-события.
- **Правила skill-библиотек, релевантные плану:**
  - `nestjs-best-practices` → `micro-use-queues`: штатный путь фоновых задач — `@nestjs/bullmq`, но он требует Redis — **вне скоупа PRD** («нет брокера очередей»).
  - `nestjs-best-practices` → `test-mock-external-services`: внешние сервисы (STT) в тестах не дёргаем — детерминированная заглушка.
  - `nestjs-best-practices` → `perf-async-hooks`: асинхронную инициализацию/остановку — только в lifecycle-хуках (`onModuleInit`/`onModuleDestroy`), с `await`; фоновые таймеры должны корректно гаситься на shutdown.
  - `nestjs-best-practices` → `arch-single-responsibility`: работу с файловой системой держать в отдельном сервисе, а не в хендлерах.
  - `vercel-react-best-practices` → `client-localstorage-schema`, `rerender-no-inline-components`, `rendering-conditional-render` (тернарник, не `&&`), `client-swr-dedup` (в проекте SWR нет — не вводим).

---

## Открытые технические вопросы

### Фаза 1 — БД + хранение файлов

1. Multipart-парсер: чем принимать файл и где ставить лимит размера (→ 413).
2. Где хранить бинарник до/после валидаций (memory vs disk storage) и как не оставить «сирот» при 404/400.
3. Белый список mime → как получить именно 400.
4. Типизация загруженного файла без `@types/multer`.
5. Prisma-модель `MeetingFile`: native enum vs `String` для `type`/`status`; связь с `Meeting` и каскад.
6. Раскладка файлов на диске и что писать в БД (абсолютный путь vs ключ).
7. Создание/резолв каталога `uploads`, env-переменные, `.gitignore`, `docker-compose`.
8. Отдача файла: `StreamableFile` vs `res.sendFile`; `Content-Disposition` с не-ASCII именем.
9. Куда положить фичу: новый модуль `meeting-file` vs папка внутри `meeting`; где вложенный роут `meetings/:id/files`.
10. Порядок проверок 401 / 413 / 400 / 404 и переиспользование `GetMeetingByIdQuery`.

### Фаза 2 — фоновая обработка

11. Механизм in-process очереди/воркера без брокера.
12. Как заглушка STT остаётся детерминированной по умолчанию (не завязываясь на `NODE_ENV=test`).
13. Как e2e наблюдает переход `recording → done` «без дополнительного вызова».
14. Как детерминированно получить статус `failed` для теста `reprocess`.
15. Хранение транскрипта: колонка на `MeetingFile` vs отдельная таблица `Transcript`.
16. Корректная остановка воркера на `app.close()` между e2e-тестами.
17. Наблюдаемость промежуточного статуса `processing`.

### Фаза 3 — страница встречи

18. Клиентский fetch vs серверный компонент; чтение `params` в Next 16.
19. Рефактор дублирования в `src/lib/api.ts` под новые методы.
20. Обработка 404 на странице (`notFound()` vs инлайн-состояние).
21. Куда вынести повторяющуюся клиентскую защиту сессией.

### Фаза 4 — блок «Файлы»

22. Прогресс загрузки: `XMLHttpRequest` в слое `api.ts`.
23. Обновление статуса без перезагрузки: поллинг vs кнопка vs оба.
24. Реализация drag-n-drop без новой зависимости.
25. Скачивание файла из браузера под Bearer-токеном (нельзя `Authorization` на `<a href>`).
26. Компоненты HeroUI под прогресс / статус / сворачиваемый транскрипт / ошибки.

---

## Разбор вариантов

### 1. Приём multipart и лимит размера тела (→ 413)

**Что требует:** план, Фаза 1 — «multipart под `JwtAuthGuard`: лимит размера тела (413)»; критерий готовности PRD «файл сверх лимита размера (413)».

**Варианты:**

1. **`FileInterceptor('file', { limits: { fileSize: MAX } })` из `@nestjs/platform-express`** — multer уже в дереве зависимостей, новых пакетов нет. При превышении multer прерывает поток и бросает `MulterError(LIMIT_FILE_SIZE)`; обёртка Nest (`transformException`) маппит его в `PayloadTooLargeException` → **413 без своего кода**. Работает с supertest `.attach()` на `app.init()` без `app.listen()`.
2. **Свой парсер (`busboy`/`@fastify/multipart`)** — новая зависимость, ручной маппинг ошибок, проект на Express-платформе (`@nestjs/platform-express`), Fastify-путь не к месту. Минусы перевешивают.
3. **Ручной разбор `req` в контроллере** — нарушает CQRS-слой и `arch-single-responsibility`, свой маппинг 413. Нет.

**Рекомендация:** вариант 1. Нулевые новые зависимости, штатный для Express-стека Nest, 413 из коробки. Лимит держать в байтах из env, прокинуть в опции интерсептора через фабрику (значение читать из `ConfigService`, не из `process.env` напрямую).

**Как ложится в проект:** `@UseInterceptors(FileInterceptor('file', ...))` на `POST`-методе нового `MeetingFileController` (под `@UseGuards(JwtAuthGuard)`, `apps/api/CLAUDE.md:106`). Значение лимита — через `ConfigModule` (`apps/api/CLAUDE.md` раздел «Соглашения», конфиг только через `ConfigService`).

**Зависимости:** нет новых npm-пакетов. Env: `MAX_UPLOAD_SIZE_BYTES` (см. вопрос 7).

**Риски:** точный класс исключения от `transformException` подтвердить тестом до реализации (спек 413 в Фазе 1 это и делает — TDD-порядок из плана снимает риск). При `memoryStorage` (см. вопрос 2) буфер до лимита держится в памяти — приемлемо, стриминг/resumable вынесены PRD в «Не в скоупе».

---

### 2. Где держать бинарник до валидаций (memory vs disk storage)

**Что требует:** план, Фаза 1 — «404 для несуществующей встречи», «бинарник в папку `uploads`, метаданные и путь в БД»; критерий PRD «повторный `DELETE` → 404», «в записи хранится только путь/ключ».

**Варианты:**

1. **`multer.memoryStorage()` (дефолт `FileInterceptor` без `storage`) → запись на диск в командном хендлере после всех проверок.** Плюсы: при 404 (нет встречи) / 400 (mime) на диск ничего не попало — «сирот» нет; путь пишется в БД в одной транзакции с метаданными; хендлер сам решает имя файла. Минусы: файл целиком в памяти (ограничен тем же лимитом, что и 413).
2. **`multer.diskStorage()` — multer сам кладёт файл.** Плюсы: не держим в памяти. Минусы: файл пишется **до** хендлера, значит до проверки существования встречи и mime → при 404/400 нужен ручной best-effort `unlink`; имя/каталог задаются в конфиге интерсептора, а не рядом с бизнес-логикой; сложнее «путь в БД только после успеха».

**Рекомендация:** вариант 1 (`memoryStorage`). Лимит размера уже прижимает потребление памяти, а инвариант «на диске только то, что есть в БД» получаем бесплатно и без компенсирующих `unlink`. Это же упрощает Фазу 2 (обработка стартует после того, как запись гарантированно создана).

**Как ложится в проект:** `CreateMeetingFileHandler` (командный хендлер) получает `{ meetingId, buffer, originalname, mimetype, size, type }`, через `QueryBus.execute(new GetMeetingByIdQuery(meetingId))` проверяет встречу (переиспользуем существующий хендлер и его `NotFoundException`, `apps/api/CLAUDE.md:109` — чтение через `QueryBus`), затем `FileStorageService.save(fileId, buffer)` и `prisma.meetingFile.create(...)`. Запись файла на ФС — в отдельном `FileStorageService` (`arch-single-responsibility`).

**Зависимости:** нет.

**Риски:** пиковая память = размер файла × параллельные загрузки. Для итерации с скромным лимитом ок; зафиксировать в `apps/api/CLAUDE.md` как осознанное ограничение (рядом с записью PRD про один инстанс).

---

### 3. Белый список mime (→ 400)

**Что требует:** план, Фаза 1 — «белый список mime (400)»; критерий PRD «mime не из белого списка (400)».

**Варианты:**

1. **`fileFilter` в опциях `FileInterceptor`, бросает `BadRequestException` при mime не из списка.** Плюсы: ранний выход (файл не буферизуется дальше), сразу 400 с понятным сообщением, один список в одном месте. Минусы: список mime задаётся в конфиге интерсептора.
2. **`ParseFilePipe` + `FileTypeValidator`.** Плюсы: идиоматично для Nest, декларативно на параметре. Минусы: дефолтный статус — 422, нужно переопределять `errorHttpStatusCode: HttpStatus.BAD_REQUEST`; `FileTypeValidator` по умолчанию матчит `file.mimetype` (заголовок клиента), не содержимое — та же надёжность, что и у варианта 1, но лишняя обвязка.
3. **Проверка в командном хендлере.** Плюсы: рядом с бизнес-логикой. Минусы: файл уже полностью принят; 400 «глубже», чем 401/413 от интерсептора — допустимо, но ранний выход лучше.

**Рекомендация:** вариант 1. Минимум обвязки, корректный 400, ранний выход. Белый список — константа модуля (напр. `apps/api/src/meeting-file/allowed-mime.ts`), переиспользуется в тестах.

**Как ложится в проект:** `fileFilter: (req, file, cb) => cb(allowed.has(file.mimetype) ? null : new BadRequestException('Недопустимый тип файла'), allowed.has(file.mimetype))`. Nest прокидывает переданную в `cb` ошибку как ответ (`error-use-exception-filters` — бросаем HTTP-исключение, не форматируем вручную).

**Зависимости:** нет. Магической проверки содержимого (`file-type`) не добавляем — PRD antivirus/валидацию содержимого не требует.

**Риски:** доверяем `Content-Type` клиента. Приемлемо для итерации; отметить в `apps/api/CLAUDE.md`.

---

### 4. Типизация загруженного файла без `@types/multer`

**Что требует:** `pnpm typecheck` в пайплайне (корневой `CLAUDE.md`); `@types/multer` в проекте нет, `Express.Multer.File` недоступен.

**Варианты:**

1. **Локальный узкий интерфейс** `UploadedFilePart { originalname: string; mimetype: string; size: number; buffer: Buffer }` в модуле фичи, им типизировать параметр `@UploadedFile()`. Плюсы: ноль зависимостей, ровно те поля, что используем. Минусы: не «официальный» тип.
2. **`pnpm add -D @types/multer`.** Плюсы: канонический `Express.Multer.File`, augmentation глобального `Express`. Минусы: новая (пусть и types-only) зависимость ради 4 полей; правило проекта — «минимум новых зависимостей».

**Рекомендация:** вариант 1 — локальный интерфейс. Совпадает с курсом на минимум зависимостей; augmentation глобального неймспейса ради одного места не нужен. Если позже понадобится широкая работа с multer-типами — вариант 2 приемлем (types-only, ESM-нейтрально).

**Как ложится в проект:** интерфейс в `apps/api/src/meeting-file/dto/uploaded-file-part.ts` (импорт с `.js`, `apps/api/CLAUDE.md:95`). `type` (recording/attachment) приходит как поле формы — валидируем через DTO с `@IsIn([...])` под `@Body()` (глобальный `ValidationPipe`, `apps/api/src/app.module.ts:24`).

**Зависимости:** нет.

**Риски:** нет.

---

### 5. Prisma-модель `MeetingFile`

**Что требует:** план, Фаза 1 — «Prisma-модель `MeetingFile` (связь с `Meeting`; `type`; `status`; метаданные; путь) + миграция»; Фаза 2 — «`DELETE` файла удаляет и его транскрипт».

**Варианты (enum'ы `type`/`status`):**

1. **Native Prisma enum** (`enum MeetingFileType { recording attachment }`, `enum MeetingFileStatus { pending processing done failed }`). Плюсы: типобезопасность в Prisma Client, проверка на уровне БД, читаемая схема. Минусы: добавление значения = миграция; в схеме пока enum'ов не было (вводим паттерн).
2. **`String` + `@IsIn` в DTO/домене.** Плюсы: гибче. Минусы: нет гарантий БД, «магические строки», расходится с типобезопасным духом остального кода.

**Рекомендация:** вариант 1 (native enum). Множества значений фиксированы контрактом PRD, миграция под новую таблицу всё равно создаётся — enum в ней бесплатен; `db-use-migrations` соблюдён.

**Связь с `Meeting` и каскад:**

- `meetingId String` + `meeting Meeting @relation(fields: [meetingId], references: [id], onDelete: Cascade)`, обратная связь `files MeetingFile[]` на `Meeting`.
- Транскрипт (см. вопрос 15) — колонкой на `MeetingFile`, тогда отдельного каскада не нужно; `DELETE` файла в хендлере дополнительно удаляет бинарник с диска.

**Как ложится в проект:** модель в `apps/api/prisma/schema.prisma` рядом с `Meeting`: `id String @id @default(cuid())`, `originalName String`, `mimeType String`, `size Int`, `type MeetingFileType`, `status MeetingFileStatus @default(done)` (перекрывается на `pending` для recording в хендлере), `storageKey String`, `transcriptText String?`, `createdAt/updatedAt`, `@@map("meeting_files")`, `@@index([meetingId])`. Миграция — `pnpm --filter api exec prisma migrate dev --name add_meeting_file` (Prisma 7, конфиг — `prisma.config.ts`); файл миграции коммитим (CI гоняет `migrate deploy`, `.github/workflows/ci.yml`).

**Зависимости:** миграция Prisma (новая таблица + 2 enum-типа). Новых npm-пакетов нет.

**Риски:** `onDelete: Cascade` уронит строки файлов при удалении встречи, но **бинарники на диске останутся сиротами** (удаление встреч в скоупе фичи нет — просто зафиксировать в `apps/api/CLAUDE.md`). Значение по умолчанию `status` — компромисс: ставим `done` в схеме, а для `recording` хендлер явно пишет `pending` в том же `create`.

---

### 6. Раскладка файлов на диске и что писать в БД

**Что требует:** план, Фаза 1 — «бинарник в папку `uploads`… путь/ключ в хранилище», критерий PRD «в записи хранится только путь/ключ».

**Варианты:**

1. **Плоско: `${UPLOADS_DIR}/${fileId}`, в БД — `storageKey = fileId`.** Плюсы: `fileId` — cuid, не содержит пользовательского ввода → нет path traversal; путь резолвится из env на чтении, том можно переносить. Минусы: на диске не видно исходных имён (не нужно — есть в БД).
2. **По встрече: `${UPLOADS_DIR}/${meetingId}/${fileId}`, в БД — `storageKey = "${meetingId}/${fileId}"`.** Плюсы: удобнее чистить «по встрече» вручную. Минусы: лишняя вложенность, оба сегмента всё равно системные.
3. **Хранить абсолютный путь в БД.** Минусы: жёстко привязывает БД к конкретному хосту/тому; перенос ломает записи. Нет.

**Рекомендация:** вариант 1 — плоско, в БД только ключ (`fileId`), абсолютный путь собирается как `path.join(config.get('UPLOADS_DIR'), key)` на чтении/удалении. Расширение к имени файла на диске **не добавляем** — `Content-Type` при отдаче берём из сохранённого `mimeType`.

**Как ложится в проект:** `FileStorageService` (`apps/api/src/meeting-file/file-storage.service.ts`): `save(key, buffer)`, `createReadStream(key)`, `remove(key)`, `resolve(key)`; в `onModuleInit` — `await fs.mkdir(baseDir, { recursive: true })` (`perf-async-hooks` — асинхронная инициализация в lifecycle-хуке).

**Зависимости:** только `node:fs/promises` / `node:path` / `node:crypto`. Env: `UPLOADS_DIR`.

**Риски:** одинаковый `fileId` не может пересечься (cuid). При падении между `fs.write` и `prisma.create` — «сирота» на диске; порядок «сначала запись в БД, потом файл» переворачивает проблему в «запись без файла» — что хуже для скачивания. Компромисс: писать файл, затем `create`; при ошибке `create` — best-effort `remove`. Отметить в `apps/api/CLAUDE.md`.

---

### 7. Каталог `uploads`, env-переменные, `.gitignore`, `docker-compose`

**Что требует:** план, Фаза 1 — «Env-переменные (путь до `uploads`, лимит размера) в `apps/api/.env.example`, том `uploads` в `docker-compose`»; критерий PRD про обновление `.env.example`.

**Варианты (env):**

1. **`UPLOADS_DIR=./uploads` (относительно cwd `apps/api`) + `MAX_UPLOAD_SIZE_BYTES=26214400`.** Плюсы: явные единицы (байты), совпадает с тем, что ждёт `limits.fileSize`. Минусы: число менее читаемо.
2. **`MAX_UPLOAD_SIZE_MB=25` + пересчёт в коде.** Плюсы: читаемее. Минусы: лишний парсинг/умножение, чуть больше кода в фабрике конфига.

**Рекомендация:** вариант 1 (`UPLOADS_DIR`, `MAX_UPLOAD_SIZE_BYTES`) — без преобразований, значение уходит в `limits.fileSize` как есть. Прописать в: `apps/api/.env.example`, локальный `apps/api/.env`, блок `env:` в `.github/workflows/ci.yml` (там гоняются e2e — каталог должен быть доступен на запись; относительный путь по умолчанию годится). Конкретные числа/дефолты — на согласование (см. «Открытые вопросы»).

**`.gitignore`:** добавить `apps/api/uploads/` (или `uploads/` в новый `apps/api/.gitignore`) — сейчас не игнорируется, e2e/дев пишут туда реальные бинарники.

**`docker-compose`:** в компоузе есть только `postgres`, сервиса `api` нет → монтировать том некуда. Требование PRD/плана здесь расходится с реальностью — вынесено в «Открытые вопросы». Технически возможно: (а) добавить именованный `volumes: uploads-data:` заранее без сервиса — бессмысленно до появления контейнера `api`; (б) задокументировать `UPLOADS_DIR` и отложить том до контейнеризации API. Рекомендация — (б), с явной строкой в `apps/api/CLAUDE.md` и в разделе «Переменные окружения» корневых доков.

**Как ложится в проект:** чтение через `ConfigService` (правило проекта); e2e видят `apps/api/.env` (нет отдельного `.env.test`, глобального setup нет — `apps/api/vitest.config.e2e.ts`).

**Зависимости:** нет npm. Правки: `apps/api/.env.example`, `apps/api/.env`, `.github/workflows/ci.yml`, `.gitignore`, доки.

**Риски:** e2e и pre-commit хук будут плодить файлы в `apps/api/uploads/`. Нужна чистка в спеке (`afterAll`/`afterEach` удаляет созданные файлы) либо `UPLOADS_DIR` во временную папку (`os.tmpdir()`) на время тестов — см. вопрос 16 и «Открытые вопросы».

---

### 8. Отдача файла и `Content-Disposition`

**Что требует:** план, Фаза 1 — «`GET …/content` (проверка `Content-Type` и `Content-Disposition`)»; критерий PRD — «корректные `Content-Type` и `Content-Disposition`».

**Варианты:**

1. **`StreamableFile` из `@nestjs/common` + `fs.createReadStream`, заголовки через опции `new StreamableFile(stream, { type: mimeType, disposition })`.** Плюсы: идиоматично, стрим (не грузим файл в память), совместимо с e2e на `app.init()`. Минусы: нужно самому собрать строку `disposition`.
2. **`@Res()` passthrough + `res.setHeader` + `res.sendFile`.** Плюсы: привычно. Минусы: `@Res()` частично выключает слой Nest, `sendFile` завязан на express-специфику, сложнее с не-ASCII именем.

**Рекомендация:** вариант 1 (`StreamableFile`). Не-ASCII имя (кириллица в `originalName`) кодируем по RFC 5987 руками: `attachment; filename="file"; filename*=UTF-8''${encodeURIComponent(originalName)}` — без пакета `content-disposition` (новых зависимостей не вводим).

**Как ложится в проект:** query-хендлер `GetMeetingFileContentQuery` возвращает `{ stream, mimeType, originalName }` (или сам `StreamableFile`); контроллер отдаёт `StreamableFile`. Проверка принадлежности файла встрече и 404 — в хендлере (`NotFoundException`, как `apps/api/src/meeting/queries/handlers/get-meeting-by-id.handler.ts:14-16`).

**Зависимости:** `node:fs`. Новых npm — нет.

**Риски:** для скачивания из браузера через `fetch`/XHR заголовок `Content-Disposition` не виден JS без `Access-Control-Expose-Headers` (CORS `app.enableCors()` его не отдаёт). Решение на Фазе 4 — имя файла берём из метаданных списка, а не из заголовка (см. вопрос 25), поэтому менять CORS не нужно.

---

### 9. Куда положить фичу и вложенный роут

**Что требует:** план — эндпоинты `POST/GET/DELETE /meetings/:id/files…`; соглашения `apps/api/CLAUDE.md:107,109` (структура CQRS-модуля, один `forRoot()`).

**Варианты:**

1. **Отдельный модуль `meeting-file`** с собственным `MeetingFileController` (`@Controller('meetings/:meetingId/files')`), `commands/`, `queries/`, `events/`, barrel-`index.ts`; `imports: [AuthModule]`. Плюсы: изоляция фичи (`arch-feature-modules`), `meeting` не разрастается, свой набор хендлеров в `providers`. Минусы: ещё один модуль в `AppModule`.
2. **Внутрь существующего `meeting`-модуля** — добавить `MeetingFileController` и хендлеры в тот же модуль. Плюсы: физически рядом со встречей. Минусы: смешение двух ресурсов в одном модуле, разбухание barrel-массивов, менее чистые границы.

**Рекомендация:** вариант 1 — отдельный модуль `meeting-file`. Повторяет паттерн «модуль на фичу» (`auth`, `users`, `meeting`), регистрирует только свои хендлеры в `providers`, `CqrsModule.forRoot()` не трогает (`apps/api/CLAUDE.md:107`). Подключить в `apps/api/src/app.module.ts` рядом с `MeetingModule`.

**Как ложится в проект:** структура `apps/api/src/meeting-file/{meeting-file.controller.ts, meeting-file.module.ts, file-storage.service.ts, commands/{impl,handlers}, queries/{impl,handlers}, events/{impl,handlers}, dto/}`. Контроллер под `@UseGuards(JwtAuthGuard)`, `imports: [AuthModule]` (`apps/api/CLAUDE.md:106`). Обновить раздел «Структура» в `apps/api/CLAUDE.md`.

**Зависимости:** нет.

**Риски:** дублирование `meetingId`-параметра в путях — стандартно для вложенных ресурсов, ок.

---

### 10. Порядок проверок 401 / 413 / 400 / 404

**Что требует:** план, Фаза 1 — набор отказов; критерии готовности PRD (тот же список).

**Порядок по факту стека (не конфигурируется, просто зафиксировать в тестах):**

1. `JwtAuthGuard` → **401** (до интерсептора и парсинга тела).
2. `FileInterceptor`: `limits.fileSize` → **413**; `fileFilter` → **400** (mime) — во время приёма потока.
3. Командный хендлер: `QueryBus(GetMeetingByIdQuery)` → **404** (нет встречи).

**Рекомендация:** тесты Фазы 1 проверяют каждый отказ независимо (как в `apps/api/test/meeting.e2e-spec.ts` — отдельный `it` на 400/401/404), не комбинируя условия — тогда порядок разрешения конфликтов не важен. `DELETE` несуществующего/уже удалённого файла → 404 через `NotFoundException` в командном хендлере (повторный `DELETE` → 404 — критерий PRD).

**Как ложится в проект:** переиспользуем `GetMeetingByIdQuery` (не дублируем чтение встречи, `apps/api/CLAUDE.md:109`). Для `GET/DELETE …/files/:fileId` — свой `NotFoundException`, если файл не найден или не принадлежит указанной встрече.

**Зависимости:** нет.

**Риски:** нет.

---

### 11. Механизм in-process очереди/воркера (Фаза 2)

**Что требует:** план, Фаза 2 — «In-process очередь/воркер внутри API (без внешнего брокера)»; PRD «нет брокера — допустима in-process очередь».

**Варианты:**

1. **`@nestjs/bullmq`** — `micro-use-queues` рекомендует именно его. Минус: **требует Redis**, PRD явно выносит брокер за скоуп. Отпадает.
2. **`EventBus` + `@EventsHandler` (существующий CQRS-паттерн).** Командный хендлер загрузки публикует `MeetingFileUploadedEvent`; обработчик события запускает обработку. Плюсы: ровно паттерн проекта (`apps/api/CLAUDE.md:109` — «побочные эффекты через `EventBus.publish` + `@EventsHandler`»), нулевые зависимости. Минусы: `EventBus` не ждёт хендлеры и глотает их ошибки — статус-переходы и `failed` нужно вести самому; между тестами хендлер может «догорать» после `app.close()`.
3. **Явный in-memory сервис-очередь** (`MeetingFileProcessingQueue`): массив задач + цикл `processNext` с `concurrency = 1`, `OnModuleDestroy` для остановки. Плюсы: контроль конкурентности, явная остановка на shutdown, легко тестируется и мокается. Минусы: ~50 строк своего кода; не переживает рестарт (в БД останутся `pending`/`processing`).

**Рекомендация:** **комбинация 2+3.** Триггер — `@EventsHandler(MeetingFileUploadedEvent)` (декуплинг контроллера от фоновой работы, как в проекте), а сам обработчик кладёт `fileId` в `MeetingFileProcessingQueue` — сервис с явным жизненным циклом, который и ведёт `pending → processing → done|failed`, вызывает заглушку STT и пишет транскрипт. Так и паттерн проекта соблюдён, и есть управляемая остановка (критично для e2e, вопрос 16).

**Как ложится в проект:** `apps/api/src/meeting-file/events/{impl/meeting-file-uploaded.event.ts, handlers/meeting-file-uploaded.handler.ts}` + `apps/api/src/meeting-file/processing/meeting-file-processing.queue.ts` (провайдер модуля). Обработка читает/пишет через `PrismaService` напрямую — это фоновая запись статуса, не доменное чтение (аналогично тому, как хендлеры пишут в Prisma). Заглушка STT — отдельный провайдер за интерфейсом-токеном (`di-use-interfaces-tokens`), см. вопрос 12.

**Зависимости:** нет новых npm.

**Риски:** после рестарта API «зависшие» `processing`/`pending` не возобновятся (PRD durability не требует — зафиксировать в `apps/api/CLAUDE.md`). Неограниченный рост очереди при всплеске загрузок — для итерации не проблема, но `concurrency = 1` + короткая заглушка это сглаживают.

---

### 12. Детерминированная заглушка STT (по умолчанию, не по `NODE_ENV=test`)

**Что требует:** план, Фаза 2 — «детерминированная заглушка STT для тестового окружения»; PRD «обработка в тестовом окружении должна быть детерминированной». Ограничение: локальный pre-commit гоняет e2e с `NODE_ENV=development` (`apps/api/.env`), CI — с `NODE_ENV=test` (`.github/workflows/ci.yml`).

**Варианты:**

1. **Заглушка — единственная реализация в этой итерации, всегда.** PRD: «Реальный движок STT… вне скоупа; обработка может быть заглушкой». Плюсы: детерминизм везде одинаково (dev, CI, e2e, pre-commit), нет ветвления по env, нечего рассинхронизировать. Минусы: нет «боевого» пути — но его и не требуется.
2. **Провайдер выбирается по `NODE_ENV`.** Минус: в `development` (локальный pre-commit) подставится «не тестовая» ветка → расходится с CI; в проекте нет `.env.test`. Ненадёжно.
3. **Отдельный флаг `STT_DRIVER=stub|...`.** Плюс: явно. Минус: ради единственной существующей реализации — лишняя переменная и ветвление.

**Рекомендация:** вариант 1. Регистрируем `SttService` (за токеном-интерфейсом) с единственной stub-реализацией: транскрипт детерминированно выводится из метаданных файла, например `Транскрипт файла «${originalName}» (${size} байт).`. Никакого ветвления по окружению. Когда появится реальный STT — вводится `STT_DRIVER` и второй провайдер (это уже за рамками текущего PRD).

**Как ложится в проект:** `apps/api/src/meeting-file/processing/stt.service.ts` + токен `STT_SERVICE`; провайдер в `MeetingFileModule`. `test-mock-external-services` соблюдён (внешнего вызова нет вовсе).

**Зависимости:** нет.

**Риски:** нет — детерминизм по построению.

---

### 13. Как e2e наблюдает `recording → done` без доп. вызова

**Что требует:** план, Фаза 2 — «`recording` детерминированно проходит `pending → processing → done` без дополнительного вызова и отдаёт связанный транскрипт»; критерий PRD.

**Варианты:**

1. **Поллинг `GET /meetings/:id/files` в тесте с ретраями и таймаутом**, пока статус не станет `done` (хелпер `waitForStatus(fileId, 'done', { timeoutMs, intervalMs })`). «Дополнительного вызова» для _запуска_ обработки нет — она стартовала сама после загрузки; поллинг — это _наблюдение_, а не триггер. Плюсы: не завязано на тайминги реализации, устойчиво. Минусы: тест ждёт (заглушка мгновенная → сходится за десятки мс).
2. **Сделать обработку синхронной внутри запроса загрузки.** Противоречит PRD («обработка фоновая, вне HTTP-запроса») и плану. Нет.
3. **Тестовый хук «дождаться пустой очереди».** Плюс: детерминированно. Минус: спец-API ради тестов, лишняя поверхность.

**Рекомендация:** вариант 1 — поллинг-хелпер в спеке. Заглушка STT резолвится на следующем тике (без искусственных задержек), очередь `concurrency = 1` — статус `done` доступен практически сразу, таймаут (напр. 5 с) — только страховка от подвисания.

**Как ложится в проект:** хелпер в `apps/api/test/meeting-files.e2e-spec.ts`; сразу после `POST …/files` для `recording` тест проверяет `status === 'pending'`, затем `waitForStatus(..., 'done')` и наличие `transcriptText`/поля транскрипта в ответе.

**Зависимости:** нет.

**Риски:** «медленный CI» → поднять таймаут; интервал поллинга 25–50 мс.

---

### 14. Детерминированный `failed` для теста `reprocess`

**Что требует:** план, Фаза 2 — «`reprocess` перезапускает только файл в статусе `failed`, для остальных статусов — ошибка»; критерий PRD.

**Варианты:**

1. **Маркер в имени файла:** заглушка STT бросает, если `originalName` содержит подстроку-маркер (напр. `fail`). e2e грузит `recording` с именем вида `broken-fail.wav` → гарантированный `failed`, затем `reprocess`. Плюсы: ноль спец-эндпоинтов, детерминированно, читаемо в тесте. Минусы: «магическая» подстрока — задокументировать в `apps/api/CLAUDE.md` как поведение заглушки.
2. **Особый mime/расширение из белого списка, который заглушка трактует как «battle-провал».** Аналогично п.1, но менее очевидно в тесте.
3. **Тестовый эндпоинт «пометить failed».** Минус: лишняя поверхность API только ради теста.
4. **Мокать `SttService` в `Test.createTestingModule` через `.overrideProvider`.** Плюсы: чисто, без маркеров в проде. Минусы: остальные e2e поднимают `AppModule` без оверрайдов — нужно либо отдельный модуль-фикстура в этом спеке, либо аккуратно комбинировать; выполнимо, но тяжелее.

**Рекомендация:** вариант 1 (маркер в имени) как основной — он не требует менять сборку тестового модуля и читается в спеке. Значение маркера — на согласование (см. «Открытые вопросы»). Вариант 4 — запасной, если не хотим «магии» в проде.

**Как ложится в проект:** заглушка `SttService` проверяет `originalName`; при маркере — `throw`. `ReprocessMeetingFileHandler` разрешает запуск только при `status === 'failed'`, иначе `ConflictException`/`BadRequestException` (какой именно — см. «Открытые вопросы»: план говорит «ошибка», код не уточняет).

**Зависимости:** нет.

**Риски:** маркер может случайно сработать на реальном имени — выбрать неочевидную строку и описать в доке.

---

### 15. Хранение транскрипта: колонка vs таблица

**Что требует:** план, Фаза 2 — «сохранение транскрипта как артефакта, связанного с файлом (доступ полем в ответе `GET /meetings/:id/files` или отдельным эндпоинтом)»; PRD «текстовый транскрипт, сохраняется и связывается с файлом».

**Варианты:**

1. **Нулевая колонка `transcriptText String?` на `MeetingFile`.** Плюсы: минимум сущностей и миграций, нет join, «доступ полем в ответе списка» — из коробки, `DELETE` файла уносит транскрипт автоматически (одна строка). Минусы: если позже понадобятся сегменты/спикеры/тайминги — придётся выносить в таблицу (но это PRD явно в «Не в скоупе»).
2. **Отдельная модель `Transcript` (1:1, `fileId @unique`, `text`, `createdAt`, `onDelete: Cascade`).** Плюсы: расширяемо, «артефакт» как отдельная сущность. Минусы: лишняя таблица/связь/миграция под задачу, где нужен один текстовый блок; больше кода в хендлерах и в форме ответа.

**Рекомендация:** вариант 1 — колонка `transcriptText String?`, отдаётся полем в `GET /meetings/:id/files`. YAGNI: контракт PRD (статусы + текстовый артефакт) закрывается колонкой; редактирование/спикеры/поиск вынесены за скоуп. Промоушен в таблицу — отдельная история, если появятся требования.

**Как ложится в проект:** колонка в модели `MeetingFile` (вопрос 5); воркер по завершении пишет `transcriptText` и `status = 'done'` одним `update`. В DTO ответа — поле `transcriptText: string | null`.

**Зависимости:** та же миграция `add_meeting_file` (колонка сразу в новой таблице — отдельная миграция не нужна).

**Риски:** большой транскрипт в строке таблицы — для заглушки несущественно; при реальном STT текст всё равно уместен в `text`-колонке Postgres.

---

### 16. Остановка воркера на `app.close()` между e2e-тестами

**Что требует:** e2e-паттерн — `afterEach(() => app.close())` (`apps/api/test/meeting.e2e-spec.ts:59-61`), в спеке Фазы 2 будет много таких циклов; `perf-async-hooks` — фоновые процессы гасить в lifecycle-хуке.

**Варианты:**

1. **`MeetingFileProcessingQueue implements OnModuleDestroy`:** флаг `stopped = true`, очистка отложенных таймеров, `await` текущей задачи (заглушка короткая → ограничено), перед каждой записью в БД — проверка `stopped` / `PrismaService` доступности. Плюсы: детерминированное завершение, нет «догорающих» промисов и обращений к закрытому `PrismaClient`. Минусы: аккуратность в реализации.
2. **Фоновая работа как неожидаемый `@EventsHandler` без явной остановки.** Минус: после `app.close()` возможен `update` по уже `$disconnect`-нутому клиенту → unhandled rejection, «плавающие» падения e2e и pre-commit.

**Рекомендация:** вариант 1 — обязательный `OnModuleDestroy` у сервиса-очереди. Это и есть причина предпочесть явный сервис «голому» `EventBus`-хендлеру (вопрос 11).

**Как ложится в проект:** `onModuleDestroy()` в `meeting-file-processing.queue.ts`; `PrismaService` уже гасится по lifecycle (`apps/api/src/prisma/prisma.service.ts:19-21`) — очередь должна встать раньше, чем закроется соединение (Nest зовёт `onModuleDestroy` в обратном порядке инициализации; очередь зависит от `PrismaService` → её `onModuleDestroy` вызовется первой).

**Зависимости:** нет.

**Риски:** если заглушка когда-нибудь станет «долгой» — `await` текущей задачи затянет закрытие; для stub-реализации несущественно.

---

### 17. Наблюдаемость статуса `processing`

**Что требует:** план, Фаза 2 — формулировка «проходит `pending → processing → done`».

**Варианты:**

1. **В e2e не утверждать перехват `processing` явно;** проверять: сразу после загрузки — `pending`, после ожидания — `done` + транскрипт. Трактовать «проходит через `processing`» как «статус не перескакивает и не застревает», а не «тест обязан поймать промежуточное значение». Плюсы: нет гонки. Минусы: `processing` не покрыт напрямую.
2. **Искусственно задержать заглушку, чтобы тест успел увидеть `processing`.** Минус: недетерминированно, замедляет весь прогон, противоречит «детерминированной заглушке».

**Рекомендация:** вариант 1. Опционально — «мягкая» проверка: в цикле поллинга допускать множество `{'pending','processing','done'}` до успеха и запретить `failed` для «хорошего» файла. Явную фиксацию `processing` вынести в «Открытые вопросы» (нужно ли это как строгий критерий).

**Зависимости:** нет.

**Риски:** нет.

---

### 18. Страница `/meetings/[id]`: клиентский fetch и чтение `params` (Next 16)

**Что требует:** план, Фаза 3 — «Страница `/meetings/[id]` (App Router) — детали встречи; состояния loading / ошибка / 404; защита сессией как в `Dashboard`».

**Варианты:**

1. **`app/meetings/[id]/page.tsx` — серверный компонент-обёртка:** `const { id } = await params` (в Next 15/16 `params` — Promise), рендерит `<MeetingDetails meetingId={id} />` — клиентский компонент из `src/components/`, который сам ходит в API с токеном из `localStorage`. Плюсы: ровно паттерн проекта (`/` → `<Dashboard/>`, `login/`, `register/` — тонкие `page.tsx` над клиентским компонентом, `apps/web/CLAUDE.md` «Структура»); `params` читается штатно на сервере. Минусы: два файла.
2. **`"use client"` прямо в `page.tsx` + `useParams()`.** Плюсы: один файл. Минусы: расходится со сложившейся структурой (`page.tsx` тонкие), клиентский `page` с параметрами — менее привычно в проекте.

**Рекомендация:** вариант 1. Данные встречи всё равно тянутся на клиенте (токен в `localStorage`, `apps/web/src/lib/session.ts`), но структура «`page.tsx` → компонент в `src/components/`» повторяет `Dashboard`.

**Как ложится в проект:** `apps/web/src/app/meetings/[id]/page.tsx` (server, `async`, `await params`) + `apps/web/src/components/meeting-details.tsx` (`"use client"`). Обновить «Структуру» и список роутов в `apps/web/CLAUDE.md`.

**Зависимости:** нет.

**Риски:** забыть `await params` → рантайм-предупреждение Next 16. Покрывается ревью/проверкой в браузере (консоль чистая — критерий плана).

---

### 19. Рефактор `src/lib/api.ts` под новые методы

**Что требует:** план, Фазы 3–4 — новые методы `getMeeting`, список файлов, загрузка, скачивание, удаление, `reprocess`; в `api.ts` блок «fetch → parse → `!ok` → `ApiError`» уже продублирован (`apps/web/src/lib/api.ts:37-61` и `83-105`).

**Варианты:**

1. **Извлечь приватный `apiFetch(path, { token?, method?, body?, headers? })`**, который делает `try/catch → ApiError(0, [...])`, `response.json().catch(() => null)`, `!response.ok → ApiError(status, normalizeMessages(...) ?? [...])`, и вернуть распарсенное тело. Новые JSON-методы — тонкие обёртки над ним. `getMeetings` перевести на него же; auth-функции можно оставить или тоже перевести. Плюсы: добавления минимальны и единообразны, меньше копипасты (DRY). Минусы: небольшой рефактор существующего кода в том же PR.
2. **Копировать блок в каждый новый метод.** Минус: 4–5 новых копий одного и того же, рост расхождений.

**Рекомендация:** вариант 1 — ввести `apiFetch` и построить новые методы поверх; заодно перевести `getMeetings`. Контракт `ApiError` (`status`, `messages`, `status === 0` = сеть) сохранить без изменений (`apps/web/CLAUDE.md:67`).

**Как ложится в проект:** правки в `apps/web/src/lib/api.ts`; загрузка с прогрессом — отдельная функция на `XMLHttpRequest` (вопрос 22), не через `apiFetch`, но с тем же `ApiError`.

**Зависимости:** нет.

**Риски:** не сломать текущее поведение `getMeetings`/auth — покрыто существующими сценариями и проверкой дашборда в браузере.

---

### 20. Обработка 404 на странице встречи

**Что требует:** план, Фаза 3 — «состояния loading / ошибка / 404»; проверка «состояние 404» в браузере.

**Варианты:**

1. **Инлайн-состояние:** расширить конечный автомат как в `Dashboard` (`'loading' | 'ready' | 'error'`, `apps/web/src/components/dashboard.tsx:63`) до `+ 'notfound'`; при `ApiError.status === 404` показывать русский экран «Встреча не найдена» со ссылкой на дашборд. Плюсы: ровно паттерн `Dashboard`, полный контроль над версткой/темами, без новых файлов роутинга. Минусы: свой экран вместо системного `not-found.tsx`.
2. **`notFound()` из `next/navigation`** в клиентском компоненте при 404 → нужен `app/meetings/[id]/not-found.tsx`. Плюсы: «канонический» Next. Минусы: в проекте нет ни одного `not-found.tsx`, паттерн `Dashboard` — инлайн-состояния; лишняя новая конвенция.

**Рекомендация:** вариант 1 — инлайн `status: 'notfound'`, консистентно с `Dashboard`. `401` при этом обрабатывается отдельно (чистка сессии + `/login`), как в `Dashboard` (`apps/web/src/components/dashboard.tsx:97-101`).

**Зависимости:** нет.

**Риски:** нет.

---

### 21. Куда вынести клиентскую защиту сессией

**Что требует:** план, Фазы 3–4 — «защита сессией как в `Dashboard`» на новой странице (а затем и блок «Файлы» внутри неё); логика `getSession → replace('/login')` + `401 → clearSession + replace('/login')` + флаг `cancelled` уже есть в `Dashboard` (`apps/web/src/components/dashboard.tsx:73-110`).

**Варианты:**

1. **Хук `useRequireSession()`** (возвращает `session | null` и делает редирект при отсутствии) + хелпер обработки `ApiError` 401. Разместить в `src/hooks/` (новая директория). Плюсы: одна реализация на `Dashboard` + `MeetingDetails` + блок «Файлы», меньше копипасты. Минусы: новая верхнеуровневая папка → правка «Структуры» в `apps/web/CLAUDE.md`; `src/lib/` не подходит — там «логика без React» (`apps/web/CLAUDE.md:30`), а это хук.
2. **Продублировать ~10 строк `useEffect`-guard** в новом компоненте. Плюсы: без новых конвенций. Минусы: копипаста растёт с каждой защищённой страницей.
3. **Вынести общий компонент-обёртку `<RequireSession>`** в `src/components/`. Плюсы: без новой папки. Минусы: оборачивание усложняет доступ к `session`/`token` в детях, придётся прокидывать через контекст/проп.

**Рекомендация:** вариант 1 (`src/hooks/use-require-session.ts`) — переиспользуемо для Фаз 3 и 4 сразу, `Dashboard` тоже можно перевести. Если не хочется новой директории — приемлем вариант 2 для одной страницы. Выбор — на согласование (см. «Открытые вопросы»).

**Как ложится в проект:** новый `src/hooks/`; обновить «Структуру» в `apps/web/CLAUDE.md`. `client-localstorage-schema` — чтения сессии уже инкапсулированы в `session.ts`, хук просто их использует.

**Зависимости:** нет.

**Риски:** новая папка = обновление доки (правило «доку и код одним PR»).

---

### 22. Загрузка с индикатором прогресса

**Что требует:** план, Фаза 4 — «загрузка (multipart с индикацией прогресса через `XMLHttpRequest`)»; PRD — «индикатор прогресса».

**Варианты:**

1. **`XMLHttpRequest` + `xhr.upload.onprogress`**, обёрнутый в `Promise`, в `src/lib/api.ts`: `uploadMeetingFile(meetingId, file, type, token, { onProgress })`. `fetch` не даёт прогресс отдачи тела — безальтернативно для прогресса. Плюсы: единственный рабочий способ; контракт `ApiError` воспроизводим (`xhr.status`, парс `xhr.responseText`, `xhr.onerror → status 0`). Минусы: XHR-код в модуле, который сейчас целиком на `fetch`.
2. **`fetch` + `ReadableStream` upload progress.** Минус: нестабильная поддержка в браузерах, требует half-duplex/эксперименталки. Нет.
3. **Библиотека (`axios`, `tus-js-client`).** Минус: новая зависимость; resumable/tus PRD выносит за скоуп; `axios` ради одного запроса избыточен.

**Рекомендация:** вариант 1 — одна XHR-функция рядом с `fetch`-методами, тот же `ApiError`. Прогресс (`0..100`) поднимается в компонент через колбэк, рендерится `ProgressBar` (HeroUI v3).

**Как ложится в проект:** `apps/web/src/lib/api.ts` — новая функция; `FormData` с полями `file` и `type`. `Authorization: Bearer` ставится через `xhr.setRequestHeader`.

**Зависимости:** нет.

**Риски:** ошибки 413/400 приходят телом ответа XHR — парсить так же, как в `apiFetch` (переиспользовать `normalizeMessages`).

---

### 23. Обновление статуса без перезагрузки

**Что требует:** план, Фаза 4 — «обновление статуса без перезагрузки (поллинг или явная кнопка)»; PRD допускает любой из двух.

**Варианты:**

1. **Условный поллинг + кнопка «Обновить».** `setInterval` (напр. 2 с) активен, только пока в списке есть файл со статусом `pending`/`processing`; как только все `done`/`failed` — интервал очищается. Плюс ручная кнопка как фолбэк. Плюсы: закрывает сценарий «recording ушёл в обработку → сам стал done», не молотит вечно, просто. Минусы: свой аккуратный `useEffect` с очисткой и защитой от гонок (флаг `cancelled`, как в `Dashboard`).
2. **Только кнопка «Обновить».** Плюсы: минимум кода. Минусы: хуже UX (пользователь должен догадаться нажать), но формально критерий PRD выполняет.
3. **SWR с `refreshInterval`** (`client-swr-dedup`). Минус: в проекте нет SWR, весь data-fetching ручной на `fetch` — ввод новой зависимости против «минимум зависимостей» и против консистентности.
4. **WebSocket/SSE.** PRD явно в «Не в скоупе».

**Рекомендация:** вариант 1 — условный самозавершающийся поллинг + кнопка «Обновить». Интервал и «только пока есть незавершённые» — детерминированно и щадяще; SWR не вводим.

**Как ложится в проект:** `MeetingFilesSection` (`"use client"`) в `src/components/`; `useEffect` с `setInterval`, зависимость — производный булев «есть незавершённые» (`rerender-derived-state`), очистка интервала в cleanup; запросы гасятся флагом `cancelled` (паттерн `apps/web/src/components/dashboard.tsx:80-109`). Компоненты списка/строки — на верхнем уровне модуля, не внутри рендера (`rerender-no-inline-components`). Условный рендер — тернарником (`rendering-conditional-render`).

**Зависимости:** нет.

**Риски:** перекрывающиеся запросы при медленном API — guard'ить «запрос уже в полёте»; интервал не меньше 1.5–2 с.

---

### 24. Drag-n-drop без новой зависимости

**Что требует:** план, Фаза 4 — «зона загрузки (drag-n-drop и выбор файла)»; PRD — то же. В HeroUI v3 компонента загрузки/дропзоны нет (проверено).

**Варианты:**

1. **Нативные события** `onDragEnter/onDragOver/onDragLeave/onDrop` (`e.preventDefault()`, `e.dataTransfer.files`) + скрытый `<input type="file">`, открываемый по клику на зону/кнопку (HeroUI `Button` «Выбрать файл»). Плюсы: ноль зависимостей, полный контроль над стилем/темами. Минусы: самому вести состояние «над зоной» для подсветки и доступность (клавиатура, `aria`).
2. **`react-dropzone`.** Плюсы: готовые хендлеры/валидация. Минусы: новая зависимость ради ~30 строк; против правила «минимум зависимостей».

**Рекомендация:** вариант 1 — нативный DnD + скрытый input. Кнопка/зона — фокусируемые, тач-цель ≥ 44px, видимый фокус, контраст ≥ 4.5:1 (`ui-ux-pro-max`: accessibility/forms). Ограничение по типам — атрибут `accept` + повторная проверка ответа сервера (400).

**Как ложится в проект:** компонент `MeetingFileDropzone` в `src/components/`, стили Tailwind v4 + токены HeroUI (класс `.dark` — тема, `apps/web/CLAUDE.md:42`). Прогресс — `ProgressBar`, ошибки — инлайн `role="alert"` в стиле форм/дашборда (`bg-danger/10 text-danger`) либо `Alert` HeroUI.

**Зависимости:** нет.

**Риски:** доступность DnD — предусмотреть полноценный путь «выбрать файл» (не только перетаскивание); проверить с клавиатуры при ревью в браузере (критерий плана).

---

### 25. Скачивание файла из браузера под Bearer-токеном

**Что требует:** план, Фаза 4 — метод «скачивание»; PRD — «скачивает любой загруженный файл по клику». Эндпоинт под `JwtAuthGuard` — нужен заголовок `Authorization`, который нельзя навесить на `<a href>`.

**Варианты:**

1. **`fetch(content, { Authorization: Bearer })` → `res.blob()` → `URL.createObjectURL(blob)` → временный `<a download={originalName}>` → клик → `revokeObjectURL`.** Имя файла берём из метаданных, уже загруженных в списке (`originalName`), а не из `Content-Disposition`. Плюсы: работает с защищённым эндпоинтом, не требует менять CORS (заголовок ответа читать не нужно). Минусы: файл целиком в память браузера (для не-resumable итерации приемлемо).
2. **Читать имя из `Content-Disposition`** ответа. Минус: нужен `Access-Control-Expose-Headers: Content-Disposition` в `app.enableCors(...)` (сейчас не настроен) — лишняя правка ради данных, которые уже есть на клиенте.
3. **Одноразовый пре-подписанный URL без токена.** PRD выносит подписанные ссылки за скоуп. Нет.

**Рекомендация:** вариант 1 — blob + `createObjectURL`, имя из метаданных списка. CORS не трогаем.

**Как ложится в проект:** `downloadMeetingFile(meetingId, fileId, token)` в `src/lib/api.ts` возвращает `Blob` (или сразу инициирует скачивание); имя — из объекта файла в состоянии компонента.

**Зависимости:** нет.

**Риски:** большие файлы в памяти вкладки — граница та же, что и лимит загрузки; отметить.

---

### 26. Компоненты HeroUI под прогресс / статус / транскрипт / ошибки

**Что требует:** план, Фаза 4 — прогресс, статус обработки, сворачиваемый транскрипт, ошибки загрузки; критерий PRD — «стиль согласован с дашбордом (HeroUI v3, Tailwind v4)».

**Рекомендация (сопоставление, всё — из состава v3.0.5, проверено):**

- **Прогресс загрузки** → `ProgressBar` (детерминированный `value` 0..100).
- **Статус файла** → `Chip` с семантическим цветом: `pending`/`processing` — нейтральный/`warning`, `done` — `success`, `failed` — `danger`. Тексты — русские («В очереди», «Обрабатывается», «Готово», «Ошибка»).
- **Транскрипт со сворачиванием** → `Disclosure` (или `DisclosureGroup`, если несколько записей) — доступный аккордеон на React Aria.
- **Ошибки загрузки (413/400/сеть)** → инлайн `role="alert"` в стиле существующих форм/дашборда (`rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger`, ср. `apps/web/src/components/dashboard.tsx:142-144`) для визуальной консистентности; альтернатива — `Alert` HeroUI.
- **Список файлов** → та же вёрстка, что `MeetingRow` на дашборде (`<ul>`/`<li>` + Tailwind), либо `Table` HeroUI, если нужны колонки действий; рекомендую лёгкий список в стиле `MeetingRow` (`apps/web/src/components/dashboard.tsx:15-32`) — согласованность с дашбордом.
- **Действия** → `Button` с `onPress` (не `onClick`, `apps/web/CLAUDE.md:41`); «Повторить» — `isDisabled` для всех статусов, кроме `failed`.
- **Загрузка/ожидание** → `Spinner` (как в `Dashboard`).

**Как ложится в проект:** все интерактивные части — в `"use client"`-компонентах `src/components/` (`apps/web/CLAUDE.md:41`). Перед реализацией — `node scripts/get_component_docs.mjs ProgressBar Disclosure Chip Alert` в skill `heroui-react` (актуальные пропсы/анатомия v3).

**Зависимости:** нет (HeroUI уже подключён).

**Риски:** пропсы v3 отличаются от v2 — не полагаться на память, брать из MDX-доков скилла.

---

## Итоговые рекомендации

**Фаза 1 (БД + хранение).**
Отдельный модуль `meeting-file` (CQRS, `imports: [AuthModule]`, `@UseGuards(JwtAuthGuard)`), эндпоинты под `@Controller('meetings/:meetingId/files')`. Приём — `FileInterceptor('file', { limits: { fileSize: MAX }, fileFilter })` из `@nestjs/platform-express` (multer уже в дереве): `limits` → 413, `fileFilter` бросает `BadRequestException` → 400, белый список mime — константа модуля. `memoryStorage`, запись на диск — в командном хендлере **после** проверки встречи через `QueryBus(GetMeetingByIdQuery)` (→ 404). Файл на ФС через `FileStorageService` (`onModuleInit` создаёт каталог), раскладка плоская `${UPLOADS_DIR}/${fileId}`, в БД — только `storageKey = fileId`. Prisma-модель `MeetingFile` с native-enum'ами `type`/`status`, `transcriptText String?`, связь с `Meeting` (`onDelete: Cascade`), `@@map("meeting_files")`; миграция `add_meeting_file` в коммит. Отдача — `StreamableFile` с `Content-Type` из `mimeType` и `Content-Disposition` (RFC 5987 для кириллицы, без пакета). Типизация файла — локальный интерфейс, без `@types/multer`. Новых env: `UPLOADS_DIR`, `MAX_UPLOAD_SIZE_BYTES` → `apps/api/.env.example`, `apps/api/.env`, `.github/workflows/ci.yml`; `apps/api/uploads/` → `.gitignore`.

**Фаза 2 (фоновая обработка).**
Триггер — `@EventsHandler(MeetingFileUploadedEvent)` (публикуется командным хендлером загрузки, паттерн `apps/api/CLAUDE.md:109`), который кладёт `fileId` в `MeetingFileProcessingQueue` — провайдер с `concurrency = 1` и обязательным `OnModuleDestroy` (флаг остановки, гашение таймеров, `await` текущей задачи) — иначе e2e с `app.close()` в `afterEach` будут «плавающе» падать. Заглушка `SttService` за токеном-интерфейсом — **единственная** реализация (не ветвим по `NODE_ENV`, т.к. локальный pre-commit идёт с `NODE_ENV=development`), транскрипт детерминирован из метаданных; `failed` для теста `reprocess` — по маркеру в имени файла. Статусы `pending → processing → done|failed` ведёт очередь; по `done` пишет `transcriptText`. `POST …/reprocess` — только при `status === 'failed'`, иначе ошибка (код — см. «Открытые вопросы»). `DELETE` файла удаляет строку (транскрипт — та же строка) и бинарник с диска. e2e наблюдает `done` поллингом `GET …/files` с таймаутом (обработка стартует сама — это наблюдение, не «дополнительный вызов»).

**Фаза 3 (страница встречи).**
`app/meetings/[id]/page.tsx` — серверная обёртка (`await params`), рендерит клиентский `src/components/meeting-details.tsx`. В `src/lib/api.ts` ввести общий `apiFetch(...)`, поверх него `getMeeting(id, token)`; `getMeetings` перевести на него же. Защита — как в `Dashboard` (нет сессии → `/login`; `ApiError 401` → `clearSession` + `/login`), желательно вынести в `useRequireSession()` (`src/hooks/`, новая папка → правка `apps/web/CLAUDE.md`), допустимо и продублировать для одной страницы. 404 — инлайн-состояние (`status: 'notfound'`), не `notFound()`. Переход с дашборда — навигация из `MeetingRow` (`next/link` или `router.push` на `/meetings/[id]`). Обновить роуты и «Структуру» в `apps/web/CLAUDE.md`. Проверка в браузере: обе темы, обе ширины, 404, чистая консоль; ревью `ui-ux-pro-max`.

**Фаза 4 (блок «Файлы»).**
Методы в `src/lib/api.ts`: список файлов и `reprocess`/`delete` — через `apiFetch`; загрузка с прогрессом — отдельная функция на `XMLHttpRequest` (`xhr.upload.onprogress`), тот же `ApiError`; скачивание — `fetch` c Bearer → `blob` → `createObjectURL` → `<a download>` (имя из метаданных списка, CORS не трогаем). Зона загрузки — нативный DnD + скрытый `<input type="file">` (без `react-dropzone`), `ProgressBar` для прогресса, инлайн `role="alert"` для ошибок 413/400/сети. Список — вёрсткой в стиле `MeetingRow`; статус — `Chip` (семантические цвета), транскрипт — `Disclosure`, действия — `Button`/`onPress`, «Повторить» `isDisabled` кроме `failed`. Обновление статуса — самозавершающийся условный поллинг (пока есть `pending`/`processing`) + кнопка «Обновить»; SWR не вводить. Компоненты списка/строк — на верхнем уровне модуля (`rerender-no-inline-components`), условный рендер — тернарником. Проверка в браузере всех состояний (прогресс, ошибка, пустой список, `failed` + «Повторить», развёрнутый транскрипт, авто-обновление), обе темы/ширины; ревью `ui-ux-pro-max`; обновить `apps/web/CLAUDE.md`.

---

## Открытые вопросы

- **Том `uploads` в `docker-compose`.** PRD и план требуют «том для контейнера API», но в `docker-compose.yml` сервиса `api` нет (только `postgres`). Варианты: (а) отложить том до контейнеризации API, ограничившись `UPLOADS_DIR` + записью в доках (рекомендуется); (б) в этом же PR добавить сервис `api` в компоуз (существенно шире скоупа фичи). Какой путь принять?
- **Белый список mime.** PRD говорит «белый список», конкретные типы не перечислены. Нужен согласованный набор для `recording` (audio/video: `audio/mpeg`, `audio/wav`/`audio/x-wav`, `audio/webm`, `audio/mp4`, `video/mp4`, `video/webm`?) и для `attachment` (`application/pdf`, `image/png`, `image/jpeg`, `text/plain`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`?). Различать ли допустимые типы по `type` файла или единый список на оба?
- **Числовые значения env.** Дефолт `MAX_UPLOAD_SIZE_BYTES` (например 25 МБ = 26214400?) и `UPLOADS_DIR` (`./uploads` относительно `apps/api`?). Согласовать с ограничением reverse-proxy (упомянуто в PRD, вне кода).
- **HTTP-код ошибки `reprocess` на не-`failed` статусе.** План/PRD говорят «возвращает ошибку», код не уточнён. `409 Conflict` (состояние ресурса не позволяет операцию) или `400 Bad Request`? Рекомендация — `409`.
- **Изоляция файлов в e2e.** БД между тестами не чистится (изоляция уникальными данными), но на диск пишутся реальные бинарники, и e2e идут в pre-commit при каждом коммите. Вариант: на время e2e ставить `UPLOADS_DIR` во временный каталог (`os.tmpdir()` + суффикс) и чистить в `afterAll`; либо спек сам удаляет созданные файлы. Какой подход предпочесть (и не заводя `.env.test`, которого в проекте нет)?
- **Маркер провала для заглушки STT.** Нужен способ детерминированно получить `failed` для теста `reprocess`. Рекомендуется подстрока в имени файла (например `__stt_fail__`), задокументированная в `apps/api/CLAUDE.md` как поведение заглушки. Согласовать саму строку либо выбрать альтернативу — `.overrideProvider(SttService)` в этом спеке (без «магии» в проде, но тяжелее по обвязке).
- **Строгость проверки статуса `processing` в e2e.** Считать ли обязательным перехватить промежуточный `processing` (риск гонки, потребует искусственной задержки), или достаточно `pending` сразу после загрузки + `done` с транскриптом после ожидания?
- **`useRequireSession()` и папка `src/hooks/`.** Вводить общий хук защиты сессии (новая директория, правка `apps/web/CLAUDE.md`) или продублировать `useEffect`-guard из `Dashboard` в новых компонентах Фаз 3–4?
- **Форма доступа к транскрипту.** Рекомендация — поле `transcriptText` в ответе `GET /meetings/:id/files`. Нужен ли дополнительно отдельный эндпоинт `GET /meetings/:id/files/:fileId/transcript` (план допускает «или отдельным эндпоинтом»), или поля в списке достаточно?
