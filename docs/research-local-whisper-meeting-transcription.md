# Research: research-local-whisper-meeting-transcription

**План:** @/home/oneal/monorepo/plan/plan-local-whisper-meeting-transcription.md
**PRD:** @/home/oneal/monorepo/docs/prd-local-whisper-meeting-transcription.md
**Дата:** 2026-09-07

---

## Контекст из документации проекта

Ограничения и соглашения, которые задают рамки реализации:

- **Чистый ESM, `nodenext`.** Относительные импорты — с расширением `.js`, даже для `.ts`
  (`apps/api/CLAUDE.md:158`). Все новые файлы движка (`whisper-stt.service.ts`, барьеры и т.п.)
  импортируются с `.js`.
- **Один `CqrsModule.forRoot()`** — в `AuthModule`, `global: true` (`apps/api/CLAUDE.md:172`,
  `meeting-file.module.ts` только регистрирует хендлеры). Новых CQRS-объектов фича не требует —
  движок это провайдер, а не команда/квери.
- **DI через интерфейс-токен.** `STT_SERVICE = Symbol(...)`, потребители зависят от интерфейса
  `SttService`, не от класса (`stt.service.ts:3-13`; правило skill `di-use-interfaces-tokens`).
  Добавление второй реализации — ровно тот случай, под который токен и заведён.
- **Конфиг только через `ConfigService`, не `process.env`** (`apps/api/CLAUDE.md:164`).
  `validateEnv` подключён через `ConfigModule.forRoot({ validate: validateEnv })`
  (`app.module.ts:17`, `config/env.validation.ts:12`) и на старте валит `production` при небезопасной
  конфигурации, вне `production` — только `warn`.
- **Файловое хранилище — единственная точка работы с ФС.** `FileStorageService`
  (`storage/file-storage.service.ts`) отдаёт только потоки (`createReadStream`, стр. 43-45);
  абсолютный путь собирает приватный `resolvePath` (стр. 57-63) с барьером traversal
  (`resolve` + `startsWith(baseDir + sep)`). Раскладка плоская: `${UPLOADS_DIR}/${storageKey}`,
  `storageKey` = `randomUUID()` (`create-meeting-file.handler.ts:29-31`). Работать с `fs` в
  хендлерах/движке напрямую нельзя (`apps/api/CLAUDE.md:178`).
- **Очередь — один in-process воркер без брокера** (`meeting-file-processing.queue.ts`).
  `concurrency = 1` обеспечен полем `draining` и циклом `drain()` (стр. 37-51). Воркер уже
  ловит любой throw из `transcribe()` → `status = failed` без записи `transcriptText`
  (стр. 63-81); `P2025` (запись удалили в процессе) гасится молча (стр. 76, 93-100).
- **`OnModuleDestroy` очереди обязателен** — e2e в `afterEach` делают `app.close()`
  (`meeting-files.e2e-spec.ts:111-113`), «догорающая» задача не должна писать в отключённый
  `PrismaClient` (`queue:11-15, 84-90`). Флаг `stopped` уже проверяется после `await`
  (стр. 41, 56, 67, 74).
- **`main.ts` НЕ вызывает `app.enableShutdownHooks()`** (`main.ts:16-39`). Значит `OnModuleDestroy`
  срабатывает только на явный `app.close()` (e2e), а на `SIGTERM`/`SIGINT` в реальном процессе —
  нет. Для цели Фазы 3 «подпроцесс убивается при остановке приложения» это пробел (см. вопрос Л).
- **Детерминированные тесты без внешних сервисов.** CI (`.github/workflows/ci.yml`) поднимает
  только Postgres, `NODE_ENV=test`, бинарника whisper/ffmpeg там нет. Pre-commit гоняет
  `pnpm lint && pnpm test && pnpm test:e2e` (`CLAUDE.md:44`). Unit-тесты обязаны мокать
  подпроцесс, e2e — держаться на `.overrideProvider(STT_SERVICE)` (`meeting-files.e2e-spec.ts:23-32,
96-99`). Вывод Whisper недетерминирован → ассертов на реальный движок нет (PRD, стр. 98).
- **Паттерн unit-тестов** — `Test.createTestingModule` + `{ provide: X, useValue: mock }`,
  `vi.fn()` (`auth/commands/handlers/change-password.handler.spec.ts:19-32`). Модульных моков
  (`vi.mock('node:...')`) в кодовой базе нет ни одного. Тесты ФС используют `mkdtemp` во временный
  каталог (`file-storage.service.spec.ts:20-31`).
- **oxlint:** `@typescript-eslint/no-floating-promises: warn` (`apps/api/oxlint.json`) — все
  промисы движка должны быть `await`/`void`.
- **Prisma-миграция не требуется** — `MeetingFileStatus` (`pending|processing|done|failed`) и
  `transcriptText String?` уже есть (`prisma/schema.prisma:41-46, 59`). PRD подтверждает:
  контракт статусов не меняется, новых HTTP-ручек нет (`prd`, стр. 66-68, 106-107).
- **`turbo.json.globalPassThroughEnv`** перечисляет пробрасываемые в задачи env
  (`turbo.json:4-12`) — новые `STT_ENGINE` / `WHISPER_*` нужно туда добавить, иначе они не дойдут
  до `test`/`build` под Turbo.
- **Актуализация докуметации тем же PR** обязательна (`CLAUDE.md:70-79`, `apps/api/CLAUDE.md:183-190`):
  `.env.example`, `apps/api/CLAUDE.md`, корневой `CLAUDE.md`/`README.md`.

---

## Открытые технические вопросы

**Фаза 1 (бэкенд, tracer bullet)**

1. Как отдать движку путь файла на диске: аксессор абсолютного пути или копия во временный файл.
2. Форма расширенного `SttInput` (`storageKey` vs абсолютный путь vs объект) и ripple в stub/e2e-фейк.
3. Вызов `whisper.cpp`: имя бинарника, формат вывода (stdout vs `.txt`-файл), парсинг в plain-text.
4. Способ запуска подпроцесса и как его мокать в unit-тестах, не ломая ESM и pre-commit.
5. Как фабрика `STT_SERVICE` выбирает реализацию по `STT_ENGINE`.
6. Обработка `WHISPER_LANGUAGE` (пусто → авто-детект).

**Фаза 2 (конвертация)** 7. Всегда гнать через `ffmpeg` или пропускать для `audio/wav`. 8. Каталог для временных файлов и стратегия гарантированной очистки.

**Фаза 3 (устойчивость)** 9. Реализация таймаута (`AbortSignal` vs ручной `setTimeout` + `kill`). 10. Проброс отмены из `queue.onModuleDestroy` в движок. 11. Убийство подпроцесса на `SIGTERM` в проде (`enableShutdownHooks`). 12. Классификация всех веток сбоя в одно брошенное исключение.

**Фаза 4 (онбординг, env-валидация, docs)** 13. Расширение `validateEnv` проверкой бинарника/модели; где держать дефолт `STT_ENGINE`. 14. Скрипт загрузки модели `tiny`. 15. Раскладка каталога whisper и записи в `.gitignore`. 16. Онбординг бинарника `whisper.cpp` и `ffmpeg` (что скриптуется, что документируется).

**Фаза 5 (веб)** 17. Нужны ли правки `meeting-files.tsx` под реальные тайминги. 18. Создавать ли `src/meeting-file/CLAUDE.md`.

---

## Разбор вариантов

### 1. Доступ движка к файлу на диске

**Что требует:** план Фаза 1 — «Добавить `FileStorageService.absolutePath(storageKey)` (переиспользует
`resolvePath`)»; PRD «Доступ движка к пути файла на диске… аккуратный аксессор абсолютного пути или
копирование во временный файл (path traversal барьер `resolvePath` сохраняется)».

**Варианты:**

1. **Публичный `absolutePath(storageKey): string`**, дергающий приватный `resolvePath`. Плюсы: одна
   строка, барьер traversal переиспользуется как есть, ноль лишнего I/O, симметрично существующему
   `createReadStream` (`file-storage.service.ts:43-45`). Минусы: путь исходного файла «утекает» за
   пределы `storage` — но только внутрь того же процесса, в доверенный движок.
2. **`copyToTemp(storageKey): Promise<string>`** — копия во временный каталог, движок читает её.
   Плюсы: исходник неприкосновенен. Минусы: лишняя копия ~десятков МБ на каждый файл, ещё один
   временный файл в очистку; в Фазе 2 всё равно появляется временный WAV от `ffmpeg` — копия
   исходника поверх него избыточна.

**Рекомендация:** вариант 1. Whisper и `ffmpeg` открывают вход только на чтение, а не-WAV в Фазе 2
всё равно уходит в новый временный WAV. Копия исходника не даёт ничего, кроме стоимости.

**Как ложится в проект:** новый публичный метод в `storage/file-storage.service.ts` рядом с
`createReadStream`; реализация — `return this.resolvePath(storageKey)` (барьер стр. 57-63 сохраняется
дословно). Unit-тест из плана («валидный ключ → путь внутри `baseDir`, `..`/абсолютный/разделители →
отказ») ложится в существующий `file-storage.service.spec.ts` по образцу его `describe` (стр. 16-27) —
`resolvePath` уже бросает `BadRequestException`, отдельная логика не нужна. `WhisperSttService`
инжектит `FileStorageService` (модуль уже импортирует `StorageModule`, `meeting-file.module.ts:5,19`).

**Зависимости:** нет. Env/миграций/томов не добавляет.

**Риски:** `resolvePath` бросает `BadRequestException` (400-семантика). Внутри воркера это исключение
просто уйдёт в `catch` очереди → `status = failed` (`queue:73-81`), что корректно, но по смыслу это
500/внутренняя ошибка, не 400. На поведение не влияет (HTTP-ответа тут нет), в тесте — просто
`rejects.toThrow()`.

---

### 2. Форма расширенного `SttInput` и ripple

**Что требует:** план Фаза 1 — «Расширить `SttInput` полем `storageKey`; прокинуть его из
`MeetingFileProcessingQueue`… обновить `StubSttService` и e2e-фейк STT под новый интерфейс».
PRD называет это «ломающим изменением интерфейса, ripple в очередь, stub и e2e-фейк».

**Варианты:**

1. **Добавить `storageKey: string` в `SttInput`** (рядом с `originalName`, `size`). Движок сам
   резолвит путь через `FileStorageService`. Плюсы: `SttInput` остаётся «сырыми метаданными из
   строки `MeetingFile`», как сейчас (`queue:63-66` читает `file.originalName`, `file.size` —
   добавится `file.storageKey`, оно есть в модели, `schema.prisma:58`); движок инкапсулирует работу
   с ФС; stub/e2e-фейк просто игнорируют новое поле. Минусы: движок получает зависимость от
   `FileStorageService`.
2. **Передавать уже готовый `absolutePath: string`** — очередь резолвит путь и кладёт в `SttInput`.
   Минусы: очередь начинает знать про ФС-детали (сейчас не знает — вся ФС в `storage`), нарушает
   `apps/api/CLAUDE.md:178` («не работать с `fs` в хендлерах»); `queue` пришлось бы инжектить
   `FileStorageService` только ради движка.
3. **Передавать `Readable`-поток** — не подходит: whisper/ffmpeg нужен путь на ФС (PRD,
   «Технические ограничения»).

**Рекомендация:** вариант 1. `SttInput = { originalName, size, storageKey }` (+ `signal?` из вопроса
10). Резолв пути — ответственность движка, у которого и так будет `FileStorageService`.

**Как ложится в проект:**

- `stt.service.ts`: в `interface SttInput` добавить `storageKey: string`. `StubSttService.transcribe`
  не меняется по телу (`input.originalName`, `input.size` — стр. 23-25), только сигнатура типа
  совместима.
- `meeting-file-processing.queue.ts:63-66`: в объект аргумента добавить `storageKey: file.storageKey`
  (`file` уже прочитан `findUnique`, стр. 55).
- `meeting-files.e2e-spec.ts:23-32`: `E2eSttService.transcribe` берёт `input.originalName` — не
  трогается; тип `SttInput` подтянется. Маркер `__stt_fail__` в имени продолжает работать.
- Прод-стаба это не ломает: транскрипт по-прежнему из метаданных, без чтения байтов
  (`apps/api/CLAUDE.md:180`).

**Зависимости:** нет.

**Риски:** тип-ripple по трём файлам — ловится `pnpm typecheck` до реализации. Если забыть обновить
`queue` — стаб будет получать `storageKey: undefined`, но не упадёт (не использует его); поймает
только тест движка. Явно перечислить оба места в задаче фазы.

---

### 3. Вызов whisper.cpp: бинарник, формат вывода, парсинг

**Что требует:** план Фаза 1 — «сборка аргументов запуска (`WHISPER_BIN_PATH`, `-m` →
`WHISPER_MODEL_PATH`, входной путь, язык, формат вывода plain-text) и парсинг вывода в текст»;
критерий PRD «`whisper.cpp` вызывается как подпроцесс с моделью `tiny`; в рантайме API нет Python».

**Варианты (формат вывода):**

1. **`stdout` + флаг «без таймкодов»** (`--no-timestamps` / `-nt`, плюс `-l <lang>`, `-m <model>`,
   `-f <input>`). Текст читается из `stdout` подпроцесса, склеивается, `trim()`. Плюсы: нет файла
   вывода → нет ещё одной сущности в очистку (план требует «временный файл вывода удаляется в
   `finally`» — при stdout его просто нет); парсинг — «собрать чанки stdout». Минусы: в stdout
   whisper.cpp иногда пишет служебные строки прогресса при `--print-progress` — отключается
   (`--no-prints` / отсутствие `-pp`); нужно проверить на конкретной сборке вручную (в скоупе —
   ручная проверка сэмпла).
2. **Файл вывода `-otxt -of <tmp>`** — whisper пишет `<tmp>.txt`, движок читает файл в UTF-8,
   удаляет в `finally`. Плюсы: детерминированный «чистый» текст, независимо от служебного вывода в
   stdout. Минусы: ещё один временный путь и ветка очистки (успех/ошибка/таймаут) — ровно то, что
   план просит закрывать `finally` на обоих путях (Фаза 2-3).

**Рекомендация:** вариант 1 (**stdout + `-nt`**), с эксплицитным глушением прогресс-вывода. Меньше
временных файлов = меньше веток очистки, а очистка — самое хрупкое место фичи (Фазы 2-3 целиком про
неё). Ручная проверка на известном сэмпле (уже в плане, «Когда готова» Фазы 1) подтвердит, что stdout
не засорён. Если на практике сборка пишет мусор в stdout — фолбэк на вариант 2 без изменения
контракта.

**Бинарник:** параметр `WHISPER_BIN_PATH` (абсолютный путь), никаких предположений об имени. В доке
указать, что это `whisper-cli` из свежих сборок `whisper.cpp` (старое имя `main` — deprecated).
Модель — `-m $WHISPER_MODEL_PATH` (ggml `tiny`).

**Как ложится в проект:** новый `src/meeting-file/processing/whisper-stt.service.ts`,
`@Injectable()`, `implements SttService`, рядом со `stt.service.ts`. Конструктор инжектит
`ConfigService` и `FileStorageService`. Сборка аргументов — чистая функция (напр.
`buildWhisperArgs(input, cfg): string[]`), которую и покрывает unit-тест плана «сборка аргументов»
отдельно от подпроцесса. Захват вывода: читать `child.stdout` как `Buffer`-чанки, `Buffer.concat`,
`.toString('utf8')` (не полагаться на строковый `encoding` у `spawn`) — закрывает требование PRD
«захват вывода — в кодировке UTF-8».

**Зависимости:** только встроенный `node:child_process` — **новых npm-пакетов нет** (см. вопрос 4).
Новые env: `WHISPER_BIN_PATH`, `WHISPER_MODEL_PATH`, `WHISPER_LANGUAGE`, `STT_ENGINE` — в
`apps/api/.env.example`, `turbo.json.globalPassThroughEnv`, CI `env` (для будущего, значения не нужны
— e2e на stub).

**Риски:** формат stdout зависит от версии `whisper.cpp` — mitigation: ручная проверка сэмпла в
Фазе 1 + фолбэк на `-otxt`. Пустой/пробельный вывод (тихий сэмпл, битый звук) → бросить ошибку
(ветка плана Фазы 3 «пустой/пробельный вывод»). На e2e/pre-commit влияния нет — там stub.

---

### 4. Запуск подпроцесса и его мок в unit-тестах

**Что требует:** план Фаза 1/3 — «unit `WhisperSttService` с замоканным `child_process`»;
ограничение проекта: pre-commit/CI не имеют whisper/ffmpeg, тесты обязаны быть детерминированы, а
модульных моков (`vi.mock`) в кодовой базе нет (`change-password.handler.spec.ts` — только DI-моки).

**Варианты:**

1. **`vi.mock('node:child_process')`** в спеке. Плюсы: буквально «замокан `child_process`», как в
   формулировке плана. Минусы: в кодовой базе прецедента нет; хойстинг `vi.mock` в ESM +
   `nodenext` капризен (фабрика мока обязана быть самодостаточной, частичный мок требует
   `importActual`); мок глобален для файла спека.
2. **Инъекция тонкого порта** — узкий интерфейс `ProcessRunner` (`run(cmd, args, opts) →
Promise<{ stdout, code }>` + поддержка `AbortSignal`), дефолтная реализация — обёртка над
   `child_process.spawn`, в тестах подменяется через `{ provide: PROCESS_RUNNER, useValue: fake }`.
   Плюсы: ровно паттерн проекта (`di-use-interfaces-tokens`, DI-моки в спеках); «замокан
   `child_process`» соблюдён по сути — реального `spawn` в тесте нет; один порт переиспользуется для
   whisper и `ffmpeg` (Фаза 2); тривиально симулировать ENOENT, ненулевой код, таймаут, `kill`
   (ветки Фазы 3). Минусы: +1 маленький файл (`process-runner.ts`), +1 провайдер в модуле.
3. **`spawn` прямо в сервисе + `vi.spyOn(child_process, 'spawn')`** — как (1), только spy. Те же
   минусы ESM-хойстинга/частичного мока.

**Рекомендация:** вариант 2 (**инъекция `ProcessRunner`**). Он единственный не вводит в проект новый
стиль тестирования, а формулировку плана («замокан `child_process`») выполняет — тест не порождает
процессов. Симметрично `FileStorageService` как «единственной точке работы с ФС»: `ProcessRunner` —
единственная точка порождения подпроцессов.

**Как ложится в проект:**
`src/meeting-file/processing/process-runner.ts` — токен `PROCESS_RUNNER = Symbol(...)`, интерфейс,
`SpawnProcessRunner implements` (обёртка `spawn`, чтение stdout/stderr в буферы, resolve по `close`,
проброс `signal`). Регистрируется в `providers` `meeting-file.module.ts` рядом с `STT_SERVICE`
(стр. 48-54). `WhisperSttService` инжектит `@Inject(PROCESS_RUNNER)`. Unit-спеки —
`whisper-stt.service.spec.ts` по образцу `change-password.handler.spec.ts` (`Test.createTestingModule`

- `useValue` с `vi.fn()`), файл попадает под `vitest.config.ts` (`**/*.spec.ts`).

**Зависимости:** **ноль новых npm** — `node:child_process` встроен; `execa`/`nanospawn` не нужны
(их плюс — удобный API и cross-platform kill — перекрывается узким портом на ~40 строк и `AbortSignal`
из Node 24; `execa` к тому же тянет зависимости и в чистом ESM живёт, но противоречит правилу
«минимум зависимостей»).

**Риски:** если выбрать вариант 1/3 — риск флейка на CI из-за ESM-хойстинга и, хуже, риск реального
`spawn('whisper')` при неполном моке → «команда не найдена», медленный/красный pre-commit. Вариант 2
этот класс рисков закрывает.

---

### 5. Фабрика `STT_SERVICE` по `STT_ENGINE`

**Что требует:** план Фаза 1 — «Фабрика провайдера `STT_SERVICE` в `MeetingFileModule` по
`STT_ENGINE` (`whisper` | `stub`, на этой фазе дефолт `stub`)»; Фаза 4 — «переключить дефолт
`STT_ENGINE` на `whisper`».

**Варианты:**

1. **`{ provide: STT_SERVICE, useFactory, inject: [ConfigService, PROCESS_RUNNER, FileStorageService] }`**
   — фабрика читает `config.get('STT_ENGINE', DEFAULT_STT_ENGINE)` и возвращает `new StubSttService()`
   либо `new WhisperSttService(runner, config, storage)`. Плюсы: один провайдер, выбор в одном месте,
   e2e `.overrideProvider(STT_SERVICE)` продолжает работать без изменений (`meeting-files.e2e-spec.ts:96-99`).
   Минусы: ручной `new` зависимостей движка в фабрике.
2. **`useClass` с условием** `useClass: engine === 'whisper' ? WhisperSttService : StubSttService`,
   оба класса — в `providers`. Минусы: условие вычисляется на этапе описания модуля (до
   `ConfigModule`), нужен `registerAsync`-подобный трюк; оба класса всегда инстанцируются Nest, даже
   неиспользуемый.
3. **Динамический модуль `SttModule.forRoot()`** — оверинжиниринг для выбора из двух классов,
   противоречит «повторяй существующий паттерн».

**Рекомендация:** вариант 1 (**`useFactory` + `inject`**). Совпадает со стилем проекта
(`MulterModule.registerAsync({ useFactory, inject: [ConfigService] })` в том же файле,
`meeting-file.module.ts:21-45`) и с примером из `di-use-interfaces-tokens`.

**Как ложится в проект:** заменить строку `{ provide: STT_SERVICE, useClass: StubSttService }`
(`meeting-file.module.ts:50`) на фабричный провайдер. `WhisperSttService`, `StubSttService`,
`SpawnProcessRunner` — в `providers` (для явности), либо движок создаётся `new` в фабрике. Константа
`DEFAULT_STT_ENGINE` в `stt.service.ts` (или `processing/stt-engine.ts`) — используется и фабрикой, и
`validateEnv` (вопрос 13), чтобы дефолт не разъехался.

**Зависимости:** `STT_ENGINE` в `.env.example` (`whisper` | `stub`, с описанием — на Фазе 1 дефолт
`stub`, на Фазе 4 меняется на `whisper`).

**Риски:** значение `STT_ENGINE` не из набора → фабрика должна бросить понятную ошибку на старте
(fail-fast), а не молча выбрать stub. Это же требование частично закрывает `validateEnv`.

---

### 6. Обработка `WHISPER_LANGUAGE`

**Что требует:** PRD «не задан → авто-детект; задан (`ru`) → принудительный язык»; критерий —
«поведение и пример описаны в `apps/api/.env.example`».

**Варианты:**

1. **Пусто/не задан → передать `-l auto`; задано → `-l <value>`.** `whisper.cpp` понимает `auto`
   как авто-детект. Плюсы: одна ветка, явный флаг всегда присутствует.
2. **Пусто → вообще не добавлять `-l`; задано → `-l <value>`.** Опирается на дефолт бинарника
   (у `whisper.cpp` дефолт — `en`, а не авто!). Минус: без `-l` получим принудительный английский,
   что противоречит PRD.

**Рекомендация:** вариант 1. Пустой/отсутствующий `WHISPER_LANGUAGE` → аргумент `-l auto`; иначе —
`-l ${value}`. Значение читать через `config.get<string>('WHISPER_LANGUAGE', '')` и `trim()`.

**Как ложится в проект:** ветка в чистой `buildWhisperArgs` — покрывается unit-тестом «язык из
`WHISPER_LANGUAGE` либо авто» (план Фаза 1) двумя кейсами. В `.env.example`:
`WHISPER_LANGUAGE=` с комментарием «пусто → авто-детект; `ru` → принудительно русский».

**Зависимости:** `WHISPER_LANGUAGE` в `.env.example` / `turbo.json` / CI env.

**Риски:** нет. Недетерминизм авто-детекта на коротких сэмплах — вне ассертов (только ручная проверка).

---

### 7. `ffmpeg`: всегда конвертировать или пропускать для WAV

**Что требует:** план Фаза 2 — «для не-WAV mime строится вызов `ffmpeg`… для `audio/wav`
конвертация пропускается»; unit-тест плана явно проверяет **пропуск** для `audio/wav`. PRD:
«`whisper.cpp` принимает только 16 кГц моно 16-bit WAV».

**Варианты:**

1. **Пропуск по mime** (`audio/wav`, `audio/x-wav` — из `allowed-mime.ts:12-13`): для них вход
   уходит в whisper напрямую, остальное — через `ffmpeg -i in -ar 16000 -ac 1 -c:a pcm_s16le out.wav`.
   Плюсы: ровно то, что просит план и его тест; экономит конвертацию для «правильных» WAV. Минусы:
   WAV бывает 44.1 кГц/стерео/24-bit — такой уйдёт в whisper как есть и там упадёт → `failed`
   (пользователь получит «Ошибка» на валидном файле).
2. **Всегда через `ffmpeg`** (даже для `audio/wav`). Плюсы: один путь, гарантированный формат,
   надёжнее. Минусы: прямо противоречит unit-тесту плана («для `audio/wav` конвертация
   пропускается»); лишний прогон `ffmpeg` для уже корректных WAV.
3. **Пропуск по фактическим параметрам** — `ffprobe` читает частоту/каналы/битность, конвертация
   только при несовпадении. Плюсы: и быстро, и надёжно. Минусы: +зависимость от `ffprobe`, +ветка,
   выходит за рамки задач плана Фазы 2.

**Рекомендация:** следовать плану — **вариант 1 (пропуск по mime `audio/wav` | `audio/x-wav`)**.
Скоуп менять нельзя, а тест плана зафиксировал поведение. Риск «нестандартный WAV → failed»
зафиксировать в «Открытые вопросы» — это осознанный компромисс (ручной `reprocess` не спасёт, но
пользователь может перекодировать файл сам; либо позже — вариант 3 отдельной задачей).

**Как ложится в проект:** предикат `needsConversion(mimeType)` — чистая функция рядом с
`buildWhisperArgs`, набор WAV-mime переиспользует значения из `allowed-mime.ts`. Оба unit-теста
плана Фазы 2 («не-WAV → вызов `ffmpeg` + в whisper уходит путь временного WAV» и «`audio/wav` →
пропуск») бьют в неё и в `ProcessRunner`-мок (вопрос 4). `mimeType` есть в строке `MeetingFile`
(`schema.prisma`) — прокинуть в `SttInput` четвёртым полем (`originalName`, `size`, `storageKey`,
`mimeType`) тем же ripple, что и `storageKey` (вопрос 2).

**Зависимости:** системный `ffmpeg` в окружении API (не npm). В `apps/api/CLAUDE.md` — раздел про
зависимость от `ffmpeg` (план Фаза 4 это требует).

**Риски:** для e2e/pre-commit — нулевой (stub, `ffmpeg` не вызывается). Для ручной проверки — mp3/mp4
должны реально сходиться (критерий PRD). Нестандартный WAV → `failed` (см. «Открытые вопросы»).

---

### 8. Временные файлы и их очистка

**Что требует:** план Фаза 2 — «во временный файл (`os.tmpdir()` или `WHISPER_TMP_DIR`)»,
«сконвертированный WAV и файл вывода whisper удаляются в `finally` на обоих путях (успех/ошибка)»;
критерий PRD — «после `done` и после `failed`… во временном каталоге не остаётся WAV-файлов».

**Варианты:**

1. **`mkdtemp(join(tmpdir(), 'whisper-'))` — отдельный каталог на каждую задачу**, все временные
   артефакты (WAV от `ffmpeg`, при варианте 2 вопроса 3 — `.txt`) внутри, в `finally` —
   `rm(dir, { recursive: true, force: true })`. Плюсы: одна операция очистки закрывает всё,
   невозможно «забыть файл»; изоляция параллельных задач (хотя `concurrency = 1`); совпадает с
   паттерном `file-storage.service.spec.ts:20-31`. `WHISPER_TMP_DIR` — необязательный override
   базового каталога (`config.get('WHISPER_TMP_DIR', tmpdir())`).
2. **Плоско в `tmpdir()` с уникальными именами** (`randomUUID()`), удаление каждого файла отдельно в
   `finally`. Минусы: список файлов на удаление растёт с числом веток (Фаза 3 добавляет таймаут),
   легче пропустить один путь.

**Рекомендация:** вариант 1 (**каталог на задачу + рекурсивное удаление в `finally`**). Требование
плана «удаляются на обоих путях» сводится к одному `rm(dir, …)` в `finally` вокруг всего
`transcribe`. `WHISPER_TMP_DIR` ввести сразу как опциональный override (план допускает «если
вводится») — стоит одну строку и упрощает изоляцию, если `tmpdir()` мал.

**Как ложится в проект:** внутри `WhisperSttService.transcribe`: `const dir = await mkdtemp(...)` →
`try { convert?; whisper } finally { await rm(dir, { recursive: true, force: true }).catch(() => …) }`.
`rm` с `force: true` не бросает на отсутствующем файле (как `FileStorageService.remove`,
`file-storage.service.ts:47-49`). Unit-тест «сконвертированный WAV удаляется и после успеха, и после
ошибки» — проверяет вызов `rm`/`mkdtemp` через мок `node:fs/promises` или через реальный `mkdtemp` +
проверку, что каталога нет (второе ближе к стилю `file-storage.service.spec.ts`).

**Зависимости:** опц. `WHISPER_TMP_DIR` в `.env.example` / `turbo.json` / CI env. Встроенные
`node:fs/promises` (`mkdtemp`, `rm`), `node:os` (`tmpdir`).

**Риски:** при `kill` по таймауту/остановке `ffmpeg`/whisper могут оставить недописанный файл в
каталоге задачи — рекурсивное удаление каталога его всё равно уносит. Если процесс API убьют
`SIGKILL` — каталог останется (ОС подчистит `tmpdir` сама); для e2e неактуально (stub).

---

### 9. Таймаут транскрибации

**Что требует:** план Фаза 3 — «таймаут `WHISPER_TIMEOUT_MS` (env, дефолт в коде) с `kill`
подпроцесса и внятной ошибкой»; критерий PRD — «по превышении подпроцесс убивается, статус → `failed`,
очередь не залипает».

**Варианты:**

1. **`AbortController` + `AbortSignal.timeout(ms)`, проброшенные в `spawn(cmd, args, { signal })`.**
   Node 24 сам шлёт `SIGTERM` процессу при срабатывании сигнала и реджектит промис `AbortError`.
   Плюсы: минимум кода, единый механизм для таймаута и внешней отмены (вопрос 10) через
   `AbortSignal.any([AbortSignal.timeout(ms), external])`; testable — в `ProcessRunner`-моке
   проверяем, что `opts.signal` передан. Минусы: `SIGTERM` может не добить зависший процесс —
   нужен «добивающий» `SIGKILL` через небольшой grace-таймер.
2. **Ручной `setTimeout` → `child.kill('SIGKILL')`.** Плюсы: полный контроль. Минусы: свой учёт
   таймеров и гонок (снять таймер в `finally`, различить «убили по таймауту» и «сам упал»); больше
   кода под тест.

**Рекомендация:** вариант 1 (**`AbortSignal`**), с добивающим `SIGKILL` по grace-таймеру
(≈2-5 с) внутри `SpawnProcessRunner`. `WHISPER_TIMEOUT_MS` — `config.get`, дефолт в коде
(напр. `300000` = 5 мин; модель `tiny` на короткой встрече укладывается в секунды-десятки секунд).
Различение причины: если `signal.aborted` из-за timeout → бросить `Error('whisper timeout after Nms')`;
из-за внешнего abort (остановка приложения) → тоже throw, воркер увидит `stopped` и не тронет БД
(`queue:67, 74`).

**Как ложится в проект:** `SpawnProcessRunner.run` принимает `{ signal, killGraceMs }`; создаёт
`child = spawn(cmd, args, { signal })`, вешает на `signal` `abort` → через `killGraceMs`
`child.kill('SIGKILL')` если не завершился. `WhisperSttService` собирает
`AbortSignal.any([AbortSignal.timeout(cfg.timeoutMs), input.signal].filter(Boolean))`. Unit-тесты
Фазы 3 «превышен `WHISPER_TIMEOUT_MS`» и «при отмене подпроцесс получает `kill`» — через мок
раннера (эмулирует abort) либо через реальный `spawn('sleep', ['10'])` c маленьким таймаутом (второе
— честнее, но `sleep` не гарантирован на всех ОС; в WSL/Linux ок).

**Зависимости:** `WHISPER_TIMEOUT_MS` в `.env.example` / `turbo.json` / CI env. Встроенные
`AbortSignal.timeout`, `AbortSignal.any` (Node ≥ 20 — есть на Node 24).

**Риски:** без добивающего `SIGKILL` намертво зависший `ffmpeg`/whisper переживёт `SIGTERM` и
удержит очередь → «залипание», которое PRD прямо запрещает. Grace-таймер обязателен. На e2e влияния
нет (stub, реального подпроцесса нет).

---

### 10. Проброс отмены из `queue.onModuleDestroy` в движок

**Что требует:** план Фаза 3 — «`MeetingFileProcessingQueue.onModuleDestroy` сигналит движку
прервать текущий подпроцесс (`AbortSignal` / явный `kill`); убедиться, что e2e `afterEach` с
`app.close()` не висит и не оставляет процессов-сирот».

**Варианты:**

1. **`signal?: AbortSignal` в `SttInput`.** Очередь держит `AbortController` на текущую задачу,
   в `onModuleDestroy` вызывает `controller.abort()` перед `await this.current`
   (`queue:84-90`). Движок передаёт `signal` в `ProcessRunner`. Плюсы: движок остаётся
   stateless, никакого «текущего процесса» в поле; единый механизм с таймаутом (вопрос 9);
   `StubSttService`/`E2eSttService` просто игнорируют `signal`. Минусы: ещё одно опциональное поле
   в `SttInput`.
2. **Метод `SttService.abort()` / `cancelCurrent()`.** Очередь зовёт его в `onModuleDestroy`.
   Минусы: расширяет интерфейс `SttService` методом, не нужным stub; движок обязан хранить ссылку
   на текущий `child` (stateful, гонки).
3. **`queue` хранит ссылку на `child_process` и убивает сам.** Грубое нарушение слоёв — очередь не
   знает про подпроцессы.

**Рекомендация:** вариант 1 (**`AbortSignal` в `SttInput`**). Ложится в тот же ripple, что
`storageKey`/`mimeType` (вопрос 2), и переиспользует abort-инфраструктуру таймаута.

**Как ложится в проект:**

- `stt.service.ts`: `SttInput.signal?: AbortSignal`.
- `meeting-file-processing.queue.ts`: поле `private current: Promise<void> | null` уже есть
  (стр. 23); добавить `private currentAbort: AbortController | null`. В `process()` перед
  `this.stt.transcribe(...)` создать контроллер, передать `signal: this.currentAbort.signal`.
  В `onModuleDestroy` (стр. 84-90): `this.currentAbort?.abort()` **перед** `await this.current`.
- `StubSttService`, `E2eSttService` — не меняются (поле опционально).

**Зависимости:** нет (встроенный `AbortController`).

**Риски:** после `abort()` `transcribe` реджектит — воркер уже в ветке `catch`, но `this.stopped`
ещё не всегда `true` в момент throw (в `onModuleDestroy` `stopped` ставится первым, стр. 85, поэтому
порядок «сначала `this.stopped = true`, потом `abort()`, потом `await`» безопасен —
`catch` увидит `stopped` и выйдет, стр. 74). Явно сохранить этот порядок. Проверяется существующим
паттерном e2e `afterEach` (`meeting-files.e2e-spec.ts:111-113`) — с stub он и так зелёный, регрессия
не вводится.

---

### 11. Убийство подпроцесса на `SIGTERM` в проде (`enableShutdownHooks`)

**Что требует:** цель Фазы 3 — «идущий подпроцесс убивается при остановке приложения»; PRD —
«запущенный подпроцесс Whisper/ffmpeg убивается при остановке приложения (`OnModuleDestroy` очереди)».

**Проблема:** `main.ts` (стр. 16-39) не вызывает `app.enableShutdownHooks()`, поэтому `SIGTERM`/
`SIGINT` реального процесса **не** триггерят `OnModuleDestroy` (сработает только явный `app.close()` в
e2e). Skill `perf-async-hooks` и `devops-graceful-shutdown` прямо требуют `app.enableShutdownHooks()`
в `bootstrap`.

**Варианты:**

1. **Добавить `app.enableShutdownHooks()` в `main.ts`** перед `app.listen(...)`. Плюсы: одна строка,
   покрывает и `queue`, и `PrismaService.onModuleDestroy` (`prisma.service.ts:19` — сейчас на
   `SIGTERM` тоже не отрабатывает); стандартная практика. Минусы: включает хуки для всех модулей —
   но в проекте их всего два, оба корректны.
2. **Свой `process.on('SIGTERM', () => app.close())`** — то же самое руками, больше кода, менее
   идиоматично для Nest.
3. **Ничего не менять** — полагаться только на `app.close()` в e2e. Минус: цель Фазы 3 в проде
   формально не выполнена (сироты `whisper`/`ffmpeg` при рестарте по сигналу).

**Рекомендация:** вариант 1. Внести в задачи Фазы 3 (план это подразумевает, но явной задачи «править
`main.ts`» в нём нет — стоит добавить). Строка `app.enableShutdownHooks()` в `main.ts:36` (перед
`await app.listen(...)`).

**Как ложится в проект:** `main.ts`, реальный `bootstrap` (не e2e — e2e поднимает `AppModule` через
`Test.createTestingModule`, `main.ts` не исполняется, `apps/api/CLAUDE.md:165`). Не ломает
security-заголовки/CORS (стр. 21-35).

**Зависимости:** нет.

**Риски:** минимальные — `enableShutdownHooks` добавляет слушателей сигналов; при большом числе
модулей Nest предупреждает о лимите listeners, здесь неактуально. Без этой правки — ручная проверка
Фазы 3 «процессов-сирот не остаётся» пройдёт только для `app.close()`, но не для `Ctrl+C` dev-сервера.

---

### 12. Классификация веток сбоя в одно исключение

**Что требует:** план Фаза 3 — «классифицировать все перечисленные сбои во вброшенную ошибку (без
частичного результата)»: нет бинарника (ENOENT), нет модели, `ffmpeg` отсутствует/ненулевой код,
whisper ненулевой код, таймаут, пустой/пробельный вывод.

**Варианты:**

1. **Бросать обычный `Error` с внятным `message` по каждой ветке.** Воркер уже переводит любой
   throw в `failed` и логирует `error.message` (`queue:77-80`). Плюсы: ничего нового, `transcriptText`
   и так пишется только при успешном `return` (`queue:69-72`) — «частичного результата» не бывает по
   конструкции. Минусы: тесты матчат по тексту (`rejects.toThrow(/model/)`), а не по типу.
2. **Кастомный класс `SttError` с полем `reason: 'binary_missing' | 'model_missing' | 'ffmpeg' |
'whisper_exit' | 'timeout' | 'empty_output'`.** Плюсы: тесты матчат `err.reason`, аккуратнее.
   Минусы: новый тип на один потребитель (воркер), который его не различает; лёгкий оверинжиниринг
   под текущие требования.

**Рекомендация:** вариант 1 (**`Error` с осмысленным сообщением**), опционально — экспортируемые
константы-префиксы сообщений, чтобы тесты не хардкодили строки. Воркер (`queue:73-81`) уже даёт
ровно нужное поведение: `failed` без `transcriptText`, `P2025` отдельно. Кастомный тип завести
позже, если появится UI-дифференциация ошибок (PRD её явно исключает — статусов остаётся 4).

**Как ложится в проект:** каждая ветка в `WhisperSttService`/`SpawnProcessRunner` бросает `Error`:
ENOENT из `spawn` (событие `error`) → `Error('whisper binary not found at <path>')`; `code !== 0` →
`Error('whisper exited with code N: <stderr tail>')`; пустой `stdout.trim()` →
`Error('whisper produced empty transcript')`; таймаут (вопрос 9). Проверка «нет модели» — до запуска,
`existsSync(modelPath)` → `Error('whisper model not found at <path>')` (быстрее и внятнее, чем ждать
ненулевой код). Unit-тесты Фазы 3 — по ветке на кейс через мок `ProcessRunner`.

**Зависимости:** нет.

**Риски:** нет. Интеграционный тест плана «`transcribe` бросает → `failed`, `transcriptText` не
записан, затем `reprocess`» уже покрыт существующей логикой (`reprocess-meeting-file.handler.ts:34-48`

- e2e `meeting-files.e2e-spec.ts:459-476`) — движок в этот механизм только «бросает».

---

### 13. `validateEnv`: проверка бинарника/модели и дефолт `STT_ENGINE`

**Что требует:** план Фаза 4 — «unit на `validateEnv`: при `STT_ENGINE=whisper` и отсутствующем
`WHISPER_BIN_PATH`/`WHISPER_MODEL_PATH`: `production` → бросает, вне production → warn; при
`STT_ENGINE=stub` проверок движка нет»; «переключить дефолт `STT_ENGINE` на `whisper`».

**Варианты (что считать «настроенным»):**

1. **Проверять и наличие переменных, и существование путей на диске** (`existsSync(binPath)`,
   `existsSync(modelPath)`). Плюсы: ловит «переменная есть, файла нет» — реальный кейс онбординга;
   критерий PRD прямо про это («без бинарника/модели старт падает в production»). Минусы: sync-I/O
   в `validateEnv`. Оправдано: это boot-time валидация, 2 `existsSync`, один раз (skill
   `perf-async-hooks` запрещает тяжёлый sync-I/O в конструкторах сервисов, не разовую проверку
   конфига).
2. **Проверять только, что переменные непустые.** Проще, без I/O. Минус: не ловит битый путь —
   отвалится уже в рантайме на первом файле (в проде — поздно).

**Рекомендация:** вариант 1. Симметрично существующей проверке `JWT_SECRET` (`env.validation.ts:12-38`):
собрать `problems[]`, в `production` — `throw`, иначе `logger.warn(... — acceptable only outside
production)`. `STT_ENGINE` резолвить через общую константу `DEFAULT_STT_ENGINE` (вопрос 5), чтобы
`validateEnv` и фабрика модуля видели один дефолт: `const engine = config.STT_ENGINE ??
DEFAULT_STT_ENGINE`.

**Как ложится в проект:** дополнить `src/config/env.validation.ts` веткой `if (engine === 'whisper')
{ if (!binPath || !existsSync(binPath)) problems.push(...); if (!modelPath || !existsSync(modelPath))
problems.push(...); }`. Импорт `existsSync` из `node:fs`. Unit-тест — новый
`env.validation.spec.ts` (сейчас спека нет) либо кейсы в существующем наборе; матрица: `whisper`
+нет путей → `production` бросает / `development` warn; `stub` → тишина. `NODE_ENV=test` (CI,
`ci.yml`) — не `production`, значит e2e/CI не упадут при `STT_ENGINE=whisper` без файлов (но e2e и так
на stub-override).

**Зависимости:** нет новых пакетов; `existsSync` встроен.

**Риски:** если дефолт `STT_ENGINE` переключить на `whisper` (Фаза 4) и оставить `validateEnv`
«фатальным» в `production` — любой прод-деплой без подготовленного движка не стартует. Это и есть
намерение PRD, но нужно, чтобы онбординг-скрипт (вопрос 14) и дока (вопрос 16) вышли тем же PR.
Локальный pre-commit (`NODE_ENV=development`) получит только `warn` — не блокирует.

---

### 14. Скрипт загрузки модели `tiny`

**Что требует:** план Фаза 4 — «Скрипт загрузки модели `tiny` в `WHISPER_MODEL_PATH` (pnpm-скрипт в
`apps/api`)»; PRD «одноразовый setup-скрипт — в скоупе, докачка на лету в рантайме — нет»; критерий —
«pnpm-скрипт кладёт модель `tiny` в `WHISPER_MODEL_PATH`; файл модели в git не попадает».

**Варианты:**

1. **`whisper.cpp/models/download-ggml-model.sh tiny`** — штатный скрипт репозитория whisper.cpp.
   Плюсы: канонический источник. Минусы: требует уже склонированного `whisper.cpp`, bash, кладёт
   модель в свой `models/`, а не в `WHISPER_MODEL_PATH` — придётся ещё копировать/симлинкать.
2. **`.mjs`-скрипт на Node (`fetch` → стрим в файл)** — качает
   `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin` в
   `process.env.WHISPER_MODEL_PATH`, идемпотентно (если файл есть и непустой — выходит). Плюсы:
   чистый ESM (`type: module` уже стоит, `apps/api/package.json:8`), глобальный `fetch` в Node 24,
   без bash/curl, кладёт файл ровно куда надо, кросс-платформенно. Минусы: свой ~30-строчный скрипт,
   надо проверять целостность (размер/при желании sha).
3. **`curl -L -o "$WHISPER_MODEL_PATH" <hf-url>`** в pnpm-скрипте. Плюсы: одна строка. Минусы:
   `curl` не гарантирован на всех дев-машинах (Windows без WSL), нет идемпотентности из коробки.

**Рекомендация:** вариант 2 (**`apps/api/scripts/download-whisper-model.mjs`**, pnpm-скрипт
`"whisper:model": "node scripts/download-whisper-model.mjs"`). Совпадает с «чистый ESM, минимум
внешних инструментов»; читает `WHISPER_MODEL_PATH` из окружения (или дефолт
`./.whisper/ggml-tiny.bin`), создаёт каталог, качает при отсутствии, печатает путь. Проверка —
размер файла ≈ 75 МБ (можно захардкодить ожидаемый размер/URL как константы).

**Как ложится в проект:** новый каталог `apps/api/scripts/` (сейчас нет), скрипт + строка в
`scripts` `apps/api/package.json`. Не заводить Turbo-таск — это разовый setup, не часть пайплайна
(`turbo.json` не трогаем, кроме `globalPassThroughEnv`). Дока: команда в `apps/api/CLAUDE.md` и
разделе env корневого `CLAUDE.md`/`README.md`.

**Зависимости:** сеть на этапе setup; ноль npm-пакетов (глобальный `fetch`, `node:fs`,
`node:stream/promises.pipeline`). Каталог в `.gitignore` (вопрос 15).

**Риски:** HuggingFace может отдать 302/rate-limit — обработать не-2xx как фатальную ошибку с внятным
сообщением. CI модель не качает (e2e на stub) — скрипт в пайплайн не входит, риска для CI нет.

---

### 15. Раскладка каталога whisper и `.gitignore`

**Что требует:** план Фаза 1/4 — «запись в `.gitignore`» для модели и бинарника; PRD «файл модели
`tiny` (~75 МБ) не коммитится: `.gitignore`, setup-скрипт и документированный путь».

**Варианты:**

1. **Один игнорируемый каталог `apps/api/.whisper/`** для модели (и, если собирают локально,
   бинарника): `WHISPER_MODEL_PATH=./.whisper/ggml-tiny.bin`,
   `WHISPER_BIN_PATH=./.whisper/whisper-cli` (или системный путь). В корневой `.gitignore` — строка
   `apps/api/.whisper/`. Плюсы: одна запись, рядом с `apps/api/uploads/` (уже игнорируется,
   `.gitignore:41`), симметрично.
2. **Отдельные пути в произвольных местах** + по строке на файл в `.gitignore`. Минус: хрупко,
   легко закоммитить 75 МБ мимо паттерна.

**Рекомендация:** вариант 1 (**каталог `apps/api/.whisper/`**, одна строка в корневом `.gitignore`
рядом с блоком «uploaded meeting files», `.gitignore:40-41`). Бинарник `whisper.cpp` большинство
поставит системно (`brew`/сборка) — тогда `WHISPER_BIN_PATH` указывает наружу и в игнор не попадает;
каталог `.whisper/` всё равно нужен под модель.

**Как ложится в проект:** правка корневого `.gitignore`; дефолты путей — в `.env.example` и в
`download-whisper-model.mjs`.

**Зависимости:** нет.

**Риски:** если кто-то задаст `WHISPER_MODEL_PATH` внутри `apps/api/src` — модель может уехать в git.
Митигация — дефолт в `.whisper/` и явная строка в `.env.example` с предупреждением.

---

### 16. Онбординг бинарника `whisper.cpp` и `ffmpeg`

**Что требует:** цель Фазы 4 — «воспроизводимая установка whisper.cpp + модели `tiny`… синхронная
документация»; PRD «Бинарник `whisper.cpp`, модель `tiny` и `ffmpeg` должны присутствовать в
окружении, где работает API; CI и pre-commit не должны от них зависеть».

**Варианты:**

1. **Модель — pnpm-скриптом (вопрос 14); бинарник `whisper.cpp` и `ffmpeg` — документированными
   командами** в `apps/api/CLAUDE.md` (`brew install whisper-cpp ffmpeg` для macOS;
   `apt/pacman` + сборка `whisper.cpp` из исходников для Linux/WSL; ссылка на релизы). Плюсы:
   реалистично — нативная сборка `whisper.cpp` под конкретную ОС/арх не сводится к одному
   кросс-платформенному скрипту; у `apps/api` нет Dockerfile (PRD, «Технические ограничения»), так
   что «воспроизводимость» = чёткая инструкция + скрипт для того, что скриптуется (модель).
2. **Bash-скрипт `setup-whisper.sh`, клонирующий и собирающий `whisper.cpp`.** Плюсы: ближе к
   «одной команде». Минусы: не работает на Windows без WSL, требует toolchain (cmake/make), хрупко,
   выходит за рамки «pnpm-скрипт» из плана.

**Рекомендация:** вариант 1. Скриптуем только модель (детерминированная загрузка файла); бинарник и
`ffmpeg` — раздел «Онбординг STT-движка» в `apps/api/CLAUDE.md` с командами по ОС и указанием, что
CI/pre-commit их не требуют (stub + мок `ProcessRunner`). Это и есть «воспроизводимость» в условиях
без контейнера.

**Как ложится в проект:** правки документации тем же PR (обязательство `CLAUDE.md:70-79`):
`apps/api/CLAUDE.md` — новый раздел (выбор движка через `STT_ENGINE`, зависимость от `ffmpeg`,
стратегия тестов, стабильные `WHISPER_*`); корневой `CLAUDE.md` и `README.md` — раздел «Переменные
окружения» дополнить `STT_ENGINE`, `WHISPER_BIN_PATH`, `WHISPER_MODEL_PATH`, `WHISPER_LANGUAGE`,
`WHISPER_TIMEOUT_MS`, `WHISPER_TMP_DIR`; `apps/api/.env.example` — все они с описанием.

**Зависимости:** системные `whisper.cpp`, `ffmpeg` (вне npm, вне CI).

**Риски:** расхождение доки с реальностью считается багом (`CLAUDE.md:79`) — раздел должен уйти в тот
же PR. `turbo.json.globalPassThroughEnv` (стр. 4-12) — не забыть добавить новые ключи, иначе под
Turbo `test`/`build` их не увидят.

---

### 17. Правки `meeting-files.tsx` под реальные тайминги

**Что требует:** план Фаза 5 — «Только если реальные тайминги ломают UX (долгий `processing`) —
минимальная правка текста/индикатора в `apps/web/src/components/meeting-files.tsx` в рамках PRD (без
новых статусов и без изменения контракта)»; PRD «дорабатываем UI только если реальный движок сломает
текущее поведение».

**Варианты:**

1. **Ничего не менять.** Поллинг раз в 3 с уже есть (`meeting-files.tsx:30`, `POLL_INTERVAL_MS`),
   статусы `pending`→«В очереди», `processing`→«Обрабатывается» со спиннером (стр. 37-42, 242-248),
   транскрипт разворачивается при `done` + `transcriptText` (стр. 167-168, 316-335), путь ошибки —
   «Ошибка обработки» + «Повторить» (стр. 41, 266-277, 337-341). Модель `tiny` на короткой встрече
   отрабатывает за секунды-десятки секунд → 1-3 цикла поллинга. Плюсы: соответствует «дорабатываем
   только если сломается».
2. **Мелкая правка копирайта** (напр. «Обрабатывается» → «Распознаём речь…») — только если ручная
   проверка покажет, что `processing` держится ощутимо долго и текущий текст дезориентирует.

**Рекомендация:** по умолчанию **вариант 1**; вариант 2 — точечно, только по итогам проверки
Playwright MCP (память `verify-frontend-with-playwright`), в пределах строк `STATUS_META`
(`meeting-files.tsx:37-42`), без новых статусов и без правки `MeetingFileStatus` (контракт,
`prd` стр. 66-68). Любая правка UI = обязательная проверка в браузере (светлая/тёмная, мобайл/десктоп)

- ревью по `ui-ux-pro-max` (`apps/web/CLAUDE.md`, «Проверка UI-изменений»).

**Как ложится в проект:** только `apps/web/src/components/meeting-files.tsx`; `src/lib/api.ts` и
контракт `MeetingFile` не трогаются (эндпоинты и форма ответа те же, `apps/api/CLAUDE.md:145`).

**Зависимости:** нет.

**Риски:** дев-сервер веба уже поднят — не запускать самому (память `dev-server-already-running`).
Проверка ошибки требует реально «сломать» движок (недоступная модель / битый звук) на локальном API
с `STT_ENGINE=whisper` — e2e/CI это не покрывают (stub).

---

### 18. `src/meeting-file/CLAUDE.md`

**Что требует:** план Фаза 4 — «Обновить… `src/meeting-file/CLAUDE.md` при наличии»; конвенция
проекта (память `project-per-module-claude-md`): логика модуля → `src/<module>/CLAUDE.md` (English),
пакетный `CLAUDE.md` держит cross-cutting правила + индекс модулей.

**Варианты:**

1. **Создать `apps/api/src/meeting-file/CLAUDE.md`** (сейчас его нет — `ls` показывает только
   `allowed-mime.ts`, `attachment-disposition.ts`, каталоги). Перенести туда специфику модуля:
   очередь (`concurrency = 1`, `OnModuleDestroy`, durability), выбор движка по `STT_ENGINE`,
   конвейер `ffmpeg → whisper.cpp`, временные файлы/очистка, `ProcessRunner`-порт, стратегия тестов
   (мок раннера в unit, stub-override в e2e). Плюсы: соответствует конвенции; фича заметно
   наращивает логику модуля — самое время. Минусы: часть текста сейчас живёт в `apps/api/CLAUDE.md:179-181`
   — нужно аккуратно вынести и оставить в пакетном файле ссылку-индекс.
2. **Дописать всё в `apps/api/CLAUDE.md`** (как сейчас, стр. 179-181). Плюсы: минимум движений.
   Минусы: пакетный файл и так большой; конвенция говорит обратное.

**Рекомендация:** вариант 1 (**создать `src/meeting-file/CLAUDE.md`**, English — память
`feedback-claude-md-in-english`). В `apps/api/CLAUDE.md` заменить детальные абзацы про
`meeting-file/processing` на короткий указатель на модульный файл (оставив в пакетном лишь
cross-cutting: где токен `STT_SERVICE`, что e2e на override). Формально план допускает «при наличии»,
но конвенция и объём новой логики склоняют к созданию — это не расширение скоупа, а требуемая
докуметация Фазы 4.

**Как ложится в проект:** новый файл + правка `apps/api/CLAUDE.md` (раздел «Структура» — упомянуть
модульный `CLAUDE.md`; раздел «Соглашения» — сжать абзацы 179-181). Всё тем же PR (`CLAUDE.md:70-79`).

**Зависимости:** нет.

**Риски:** рассинхрон, если часть правды останется в двух местах — при выносе перепроверить, что в
пакетном файле не осталось дубля.

---

## Итоговые рекомендации

- **Фаза 1.** `FileStorageService.absolutePath(storageKey)` = публичная обёртка над `resolvePath`
  (без копий). `SttInput` расширяется до `{ originalName, size, storageKey, mimeType, signal? }`,
  ripple в `queue` + `StubSttService` + `E2eSttService` (поля опциональны/игнорируются стабами).
  `WhisperSttService implements SttService` вызывает `whisper.cpp` через инъектируемый порт
  `ProcessRunner` (обёртка `node:child_process.spawn`, **ноль новых npm**), вывод — из `stdout` с
  `-nt`, парсинг = `Buffer.concat().toString('utf8').trim()`. Провайдер `STT_SERVICE` —
  `useFactory` + `inject` по `STT_ENGINE` (дефолт на этой фазе `stub`), дефолт в общей константе
  `DEFAULT_STT_ENGINE`. `WHISPER_LANGUAGE` пусто → `-l auto`, иначе `-l <value>`.
- **Фаза 2.** Пропуск `ffmpeg` по mime (`audio/wav` | `audio/x-wav`, из `allowed-mime.ts`), иначе
  `ffmpeg -ar 16000 -ac 1 -c:a pcm_s16le` во временный WAV. Каталог на задачу
  `mkdtemp(join(WHISPER_TMP_DIR ?? tmpdir(), 'whisper-'))`, очистка = один
  `rm(dir, { recursive: true, force: true })` в `finally` вокруг всего `transcribe`.
- **Фаза 3.** Таймаут `WHISPER_TIMEOUT_MS` (дефолт в коде) через
  `AbortSignal.any([AbortSignal.timeout(ms), input.signal])` → `spawn(..., { signal })` +
  добивающий `SIGKILL` по grace-таймеру в `SpawnProcessRunner`. Отмена из
  `queue.onModuleDestroy`: очередь держит `AbortController` на текущую задачу, порядок
  `stopped = true` → `abort()` → `await current`. Добавить `app.enableShutdownHooks()` в `main.ts`.
  Каждая ветка сбоя (ENOENT/нет модели/`ffmpeg`/ненулевой код/таймаут/пустой вывод) → `throw Error`
  с внятным сообщением; воркер уже даёт `failed` без `transcriptText` и совместим с существующим
  `reprocess`.
- **Фаза 4.** `validateEnv`: при `engine === 'whisper'` проверять непустоту и `existsSync`
  `WHISPER_BIN_PATH`/`WHISPER_MODEL_PATH` — `throw` в `production`, `warn` вне (как для `JWT_SECRET`);
  дефолт `STT_ENGINE` → `whisper` через `DEFAULT_STT_ENGINE`. Модель — `apps/api/scripts/
download-whisper-model.mjs` (pnpm `whisper:model`, глобальный `fetch`, идемпотентно) в
  `apps/api/.whisper/` (в корневом `.gitignore`). Бинарник `whisper.cpp` и `ffmpeg` — раздел
  инструкций в `apps/api/CLAUDE.md`. Новые env — в `.env.example`, `turbo.json.globalPassThroughEnv`,
  CI `env`. Создать `src/meeting-file/CLAUDE.md` (English), сжать дубль в `apps/api/CLAUDE.md`.
- **Фаза 5.** UI по умолчанию не менять — существующий поллинг (3 с), статусы и разворот транскрипта
  покрывают сценарий. Правка только `meeting-files.tsx` (`STATUS_META`), только если ручная проверка
  через Playwright MCP покажет проблему с длинным `processing`; после любой правки — проверка в
  браузере + ревью `ui-ux-pro-max`.

---

## Открытые вопросы

- **Нестандартный WAV (44.1 кГц / стерео / 24-bit) при пропуске `ffmpeg` по mime.** План и его
  unit-тест требуют пропускать конвертацию для `audio/wav`, но такой файл упадёт в `whisper.cpp`
  → `failed` на формально валидной загрузке, и `reprocess` не поможет. Принять как осознанный
  компромисс (в духе PRD «Не в скоупе»)? Или всё же всегда гнать через `ffmpeg` (расходится с
  тестом плана), либо позже добавить `ffprobe`-проверку параметров отдельной задачей?
- **Дефолт `WHISPER_TIMEOUT_MS`.** План говорит «дефолт в коде», конкретного значения нет.
  Предложение — 300000 мс (5 мин) для модели `tiny` на коротких встречах. Подтвердить или задать
  другое (зависит от ожидаемой длины записей, а PRD «чанковую транскрибацию длинных файлов» выносит
  за скоуп).
- **Добавление `app.enableShutdownHooks()` в `main.ts`.** В задачах плана Фазы 3 этой правки явно
  нет, хотя цель «подпроцесс убивается при остановке приложения» без неё в проде не достигается
  (e2e спасает только явный `app.close()`). Включаем в Фазу 3?
- **Создание `src/meeting-file/CLAUDE.md`.** План формулирует «при наличии» (файла сейчас нет),
  конвенция проекта — за создание. Создаём тем же PR и переносим специфику из `apps/api/CLAUDE.md`?
- **Имя бинарника в документации.** `whisper.cpp` переименовал CLI `main` → `whisper-cli`.
  Фиксируем в доке `whisper-cli` как рекомендованный, но параметр `WHISPER_BIN_PATH` оставляем
  свободным (любой путь) — подтвердить, что этого достаточно.
