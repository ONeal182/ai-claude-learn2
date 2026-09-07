# Workflow: реализация локальной транскрибации через Whisper

**PRD:** @/home/oneal/monorepo/docs/prd-local-whisper-meeting-transcription.md
**План:** @/home/oneal/monorepo/plan/plan-local-whisper-meeting-transcription.md
**Ресёрч:** @/home/oneal/monorepo/docs/research-local-whisper-meeting-transcription.md
**Дата:** 2026-09-07
**Ветка:** `security/data-ownership-and-hardening` (или новая `feat/local-whisper-transcription` от `main`)

Пошаговый порядок реализации: 5 фаз плана, в каждой сначала красные тесты, затем реализация до
зелёных, затем гейты и коммит. Технические решения из ресёрча зафиксированы ниже как данность —
переспрашивать по ним не нужно.

---

## Зафиксированные решения (из ресёрча)

| # | Вопрос | Решение |
|---|--------|---------|
| R1 | Доступ движка к файлу | `FileStorageService.absolutePath(storageKey): string` — публичная обёртка над приватным `resolvePath`, без копий во временный файл. |
| R2 | Форма `SttInput` | `{ originalName, size, storageKey, mimeType, signal? }`. Ripple: `queue`, `StubSttService`, `E2eSttService` (новые поля опциональны для стабов). |
| R3 | Запуск подпроцесса | Инъектируемый порт `ProcessRunner` (обёртка `node:child_process.spawn`). **Ноль новых npm-пакетов.** |
| R4 | Мок в unit-тестах | Подмена `PROCESS_RUNNER` через `{ provide, useValue }` + `vi.fn()`. Никаких `vi.mock('node:child_process')`. |
| R5 | Формат вывода whisper | `stdout` + флаг `--no-timestamps` (`-nt`), парсинг = `Buffer.concat(chunks).toString('utf8').trim()`. |
| R6 | Выбор движка | Провайдер `STT_SERVICE` через `useFactory` + `inject: [ConfigService, PROCESS_RUNNER, FileStorageService]` по `STT_ENGINE`. Общая константа `DEFAULT_STT_ENGINE`. |
| R7 | Язык | `WHISPER_LANGUAGE` пусто/не задан → аргумент `-l auto`; задан → `-l <value>` (после `trim()`). |
| R8 | Пропуск `ffmpeg` | Пропускать конвертацию только для mime `audio/wav` и `audio/x-wav`; иначе `ffmpeg -i <in> -ar 16000 -ac 1 -c:a pcm_s16le <out>`. |
| R9 | Временные файлы | Каталог на задачу: `mkdtemp(join(WHISPER_TMP_DIR ?? os.tmpdir(), 'whisper-'))`. Очистка — один `rm(dir, { recursive: true, force: true })` в `finally` вокруг всего `transcribe`. |
| R10 | Таймаут | `WHISPER_TIMEOUT_MS`, **дефолт `300000` (5 мин) в коде**. Реализация: `AbortSignal.any([AbortSignal.timeout(ms), input.signal].filter(Boolean))` → `spawn(cmd, args, { signal })` + добивающий `SIGKILL` по grace-таймеру (~3000 мс) внутри `SpawnProcessRunner`. |
| R11 | Отмена из очереди | `MeetingFileProcessingQueue` держит `AbortController` на текущую задачу. Порядок в `onModuleDestroy`: `this.stopped = true` → `this.currentAbort?.abort()` → `await this.current`. |
| R12 | Остановка приложения | Добавить `app.enableShutdownHooks()` в `apps/api/src/main.ts` (Фаза 3). |
| R13 | Классификация ошибок | Каждая ветка сбоя → `throw new Error('<внятное сообщение>')`. Наличие бинарника/модели проверять `existsSync` до `spawn`. Воркер уже переводит любой throw в `failed` без `transcriptText`. |
| R14 | Загрузка модели | `apps/api/scripts/download-whisper-model.mjs` (глобальный `fetch`, идемпотентно), pnpm-скрипт `whisper:model`. Модель → `apps/api/.whisper/ggml-tiny.bin`. |
| R15 | `.gitignore` | Одна строка `apps/api/.whisper/` в корневом `.gitignore`. |
| R16 | Онбординг бинарника | `whisper.cpp` (`whisper-cli`) и `ffmpeg` — документированные команды в `apps/api/CLAUDE.md`, не скрипт. `WHISPER_BIN_PATH` — любой путь. |
| R17 | UI | По умолчанию `meeting-files.tsx` не менять. Правка только `STATUS_META` (текст/индикатор) и только если ручная проверка покажет проблему с долгим `processing`. |
| R18 | Документация модуля | Создать `apps/api/src/meeting-file/CLAUDE.md` (English), перенести туда детали `processing`, в `apps/api/CLAUDE.md` оставить указатель. |

---

## Общие правила (соблюдать во всех фазах)

- **ESM `nodenext`:** относительные импорты — с расширением `.js` (`apps/api/CLAUDE.md:158`).
- **Конфиг только через `ConfigService`**, не `process.env` (`apps/api/CLAUDE.md:164`).
- **Работа с ФС — только через `FileStorageService`** и `node:fs/promises` внутри движка/скрипта; не в командных хендлерах (`apps/api/CLAUDE.md:178`).
- **Новых npm-зависимостей нет** — только встроенные `node:child_process`, `node:fs/promises`, `node:os`, `node:path`, глобальные `fetch` / `AbortSignal`.
- **Никаких HTTP-ручек и миграций Prisma** — enum и `transcriptText` уже есть (`prisma/schema.prisma:41-46,59`).
- **e2e всегда на stub** через `.overrideProvider(STT_SERVICE)` — бинарник whisper/`ffmpeg` в CI и pre-commit не нужны.
- **Каждая новая env-переменная** добавляется в трёх местах: `apps/api/.env.example`, `turbo.json` → `globalPassThroughEnv`, `.github/workflows/ci.yml` → `env` (значение для CI — заглушка/пусто, e2e её не использует).
- **oxlint:** `@typescript-eslint/no-floating-promises: warn` — все промисы `await` или `void`.
- **Гейт перед каждым коммитом:** `pnpm lint && pnpm typecheck && pnpm --filter api test` (+ `pnpm --filter api test:e2e` при поднятом Postgres: `docker compose up -d postgres`).
- **Трейлер коммита:**
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01QKVf9E9uEy6Xs16CDWWVfx
  ```

---

## Фаза 1 — Бэкенд: реальная транскрибация WAV через whisper.cpp (tracer bullet)

**Цель:** при `STT_ENGINE=whisper` загруженная WAV-запись проходит `pending → processing → done`,
в `transcriptText` — реальный текст от whisper.cpp с моделью `tiny` (happy path). Дефолт `STT_ENGINE`
на этой фазе — `stub`.

### Файлы

| Действие | Путь |
|----------|------|
| NEW | `apps/api/src/meeting-file/processing/process-runner.ts` — токен `PROCESS_RUNNER`, интерфейс `ProcessRunner`, класс `SpawnProcessRunner` |
| NEW | `apps/api/src/meeting-file/processing/process-runner.spec.ts` — прогон реальной короткой команды (`node -e`), захват stdout/UTF-8, ненулевой код |
| NEW | `apps/api/src/meeting-file/processing/whisper-command.ts` — чистые `buildWhisperArgs(input, cfg)` (Фаза 1), позже `needsConversion` / `buildFfmpegArgs` (Фаза 2) |
| NEW | `apps/api/src/meeting-file/processing/whisper-stt.service.ts` — `WhisperSttService implements SttService` |
| NEW | `apps/api/src/meeting-file/processing/whisper-stt.service.spec.ts` |
| EDIT | `apps/api/src/storage/file-storage.service.ts` — публичный `absolutePath(storageKey)` |
| EDIT | `apps/api/src/storage/file-storage.service.spec.ts` — кейсы `absolutePath` |
| EDIT | `apps/api/src/meeting-file/processing/stt.service.ts` — `SttInput` + `SttEngine` + `DEFAULT_STT_ENGINE = 'stub'` |
| EDIT | `apps/api/src/meeting-file/processing/meeting-file-processing.queue.ts` — прокинуть `storageKey`, `mimeType` |
| EDIT | `apps/api/src/meeting-file/meeting-file.module.ts` — фабрика `STT_SERVICE` + регистрация `SpawnProcessRunner`, `WhisperSttService` |
| EDIT | `apps/api/test/meeting-files.e2e-spec.ts` — проверить, что `E2eSttService` компилируется с новым `SttInput` (правки по типам, если нужно) |
| EDIT | `apps/api/.env.example` — `STT_ENGINE`, `WHISPER_BIN_PATH`, `WHISPER_MODEL_PATH`, `WHISPER_LANGUAGE` |
| EDIT | `turbo.json`, `.github/workflows/ci.yml` — те же ключи в `globalPassThroughEnv` / `env` |

### Шаги

1. **RED — `file-storage.service.spec.ts`:** добавить `describe('absolutePath')` — валидный ключ →
   путь внутри `baseDir`; `..`, абсолютный путь, разделитель в ключе → `BadRequestException`
   (переиспользует барьер `resolvePath`, `file-storage.service.ts:57-63`).
2. **RED — `process-runner.spec.ts`:** `SpawnProcessRunner.run('node', ['-e','process.stdout.write("привет")'])`
   → `{ stdout: 'привет', code: 0 }` в UTF-8; `run('node', ['-e','process.exit(3)'])` → `code === 3`
   (или reject — зафиксировать контракт: **ненулевой код → reject `Error`**).
3. **RED — `whisper-stt.service.spec.ts`** (мок `PROCESS_RUNNER` через `useValue` + `vi.fn()`,
   образец — `auth/commands/handlers/change-password.handler.spec.ts:19-32`):
   - сборка аргументов: `-m <WHISPER_MODEL_PATH>`, входной абсолютный путь из
     `FileStorageService.absolutePath(storageKey)`, `-nt`, `-l auto` при пустом `WHISPER_LANGUAGE`;
   - `WHISPER_LANGUAGE=ru` → `-l ru`;
   - парсинг: раннер вернул `stdout` с текстом и переводами строк → `transcribe` вернул
     `stdout.trim()`;
   - `WHISPER_BIN_PATH` попадает в вызов раннера как команда.
4. **GREEN — `file-storage.service.ts`:** `absolutePath(storageKey: string): string { return this.resolvePath(storageKey); }`
   рядом с `createReadStream` (стр. 43-45).
5. **GREEN — `process-runner.ts`:** `PROCESS_RUNNER = Symbol('PROCESS_RUNNER')`; интерфейс
   `run(command, args, opts?): Promise<{ stdout: string; stderr: string; code: number }>`;
   `SpawnProcessRunner` — `spawn`, чтение `stdout`/`stderr` в массив `Buffer`, `Buffer.concat().toString('utf8')`,
   resolve по событию `close`, reject по событию `error` (ENOENT) и по ненулевому `code`. Поля
   `signal` / `killGraceMs` объявить в `opts`, но полноценно задействовать в Фазе 3.
6. **GREEN — `stt.service.ts`:**
   - `export type SttEngine = 'whisper' | 'stub';`
   - `export const DEFAULT_STT_ENGINE: SttEngine = 'stub';` (в Фазе 4 → `'whisper'`)
   - `SttInput` += `storageKey: string; mimeType: string; signal?: AbortSignal;`
   - `StubSttService.transcribe` — тело без изменений (использует `originalName`, `size`).
7. **GREEN — `whisper-command.ts`:** `buildWhisperArgs({ inputPath, modelPath, language }): string[]`.
8. **GREEN — `whisper-stt.service.ts`:** `@Injectable()`, конструктор
   `(@Inject(PROCESS_RUNNER) runner, config: ConfigService, storage: FileStorageService)`;
   `transcribe(input)`: `inputPath = storage.absolutePath(input.storageKey)` → `runner.run(binPath, buildWhisperArgs(...))`
   → `text = result.stdout.trim()` → вернуть `text`. (Ветки ошибок и пустой вывод — Фаза 3;
   здесь только happy path.)
9. **GREEN — `meeting-file-processing.queue.ts:63-66`:** в объект аргумента добавить
   `storageKey: file.storageKey, mimeType: file.mimeType`.
10. **GREEN — `meeting-file.module.ts:48-54`:** заменить `{ provide: STT_SERVICE, useClass: StubSttService }`
    на:
    ```ts
    { provide: PROCESS_RUNNER, useClass: SpawnProcessRunner },
    StubSttService,
    WhisperSttService,
    {
      provide: STT_SERVICE,
      inject: [ConfigService, PROCESS_RUNNER, FileStorageService],
      useFactory: (config, runner, storage) => {
        const engine = (config.get('STT_ENGINE') ?? DEFAULT_STT_ENGINE) as SttEngine;
        if (engine === 'whisper') return new WhisperSttService(runner, config, storage);
        if (engine === 'stub') return new StubSttService();
        throw new Error(`Unknown STT_ENGINE: ${engine}`);
      },
    },
    ```
    `FileStorageService` доступен — модуль уже импортирует `StorageModule` (`meeting-file.module.ts:5,19`).
11. **GREEN — `.env.example`:** блок «STT / Whisper» — `STT_ENGINE=stub`, `WHISPER_BIN_PATH=`,
    `WHISPER_MODEL_PATH=./.whisper/ggml-tiny.bin`, `WHISPER_LANGUAGE=` (комментарий: пусто → авто-детект,
    `ru` → принудительно русский).
12. **GREEN — `turbo.json` / `ci.yml`:** добавить `STT_ENGINE`, `WHISPER_BIN_PATH`,
    `WHISPER_MODEL_PATH`, `WHISPER_LANGUAGE`.
13. Проверить типы в `apps/api/test/meeting-files.e2e-spec.ts` (`E2eSttService` реализует `SttService`)
    — компиляция с новым `SttInput`.

### Гейты

- `pnpm --filter api test` — зелёный (unit на замоканном `PROCESS_RUNNER`).
- `pnpm --filter api test:e2e` — зелёный, дефолт движка `stub`, заглушечный транскрипт не изменился.
- `pnpm lint && pnpm typecheck`.
- **Ручная проверка (вне гейтов CI):** при `STT_ENGINE=whisper`, подготовленных `WHISPER_BIN_PATH` /
  `WHISPER_MODEL_PATH` и коротком WAV с известной речью — файл проходит `pending → processing → done`,
  `transcriptText` содержит реально произнесённые слова. Python в рантайме не используется.

### Коммит

`feat(api): add WhisperSttService with real whisper.cpp transcription for WAV`

---

## Фаза 2 — Бэкенд: конвертация не-WAV через ffmpeg

**Цель:** mp3/m4a/webm/ogg/mp4/mov конвертируются в 16 кГц моно 16-bit WAV перед whisper; временные
файлы всегда убираются (успех и ошибка).

### Файлы

| Действие | Путь |
|----------|------|
| EDIT | `apps/api/src/meeting-file/processing/whisper-command.ts` — `needsConversion(mimeType)`, `buildFfmpegArgs(inputPath, outputPath)` |
| EDIT | `apps/api/src/meeting-file/processing/whisper-stt.service.ts` — шаг конвертации + временный каталог + `finally`-очистка |
| EDIT | `apps/api/src/meeting-file/processing/whisper-stt.service.spec.ts` — кейсы конвертации и очистки |
| EDIT | `apps/api/.env.example`, `turbo.json`, `.github/workflows/ci.yml` — `WHISPER_TMP_DIR` (опционально) |

### Шаги

1. **RED — `whisper-stt.service.spec.ts`:**
   - `mimeType: 'audio/mpeg'` → раннер вызван для `ffmpeg` с `-ar 16000 -ac 1` (16-bit), выход во
     временный файл; в whisper уходит путь этого WAV;
   - `mimeType: 'audio/wav'` (и `audio/x-wav`) → вызова `ffmpeg` нет, whisper получает исходный путь;
   - после успешного `transcribe` временный каталог удалён (`rm` вызван / каталога нет);
   - раннер whisper бросил → временный каталог всё равно удалён (`finally`).
2. **GREEN — `whisper-command.ts`:**
   - `const WAV_MIME_TYPES = new Set(['audio/wav', 'audio/x-wav']);` (значения из `allowed-mime.ts:12-13`)
   - `needsConversion(mimeType: string): boolean => !WAV_MIME_TYPES.has(mimeType)`
   - `buildFfmpegArgs(inputPath, outputPath): string[]` → `['-i', inputPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-y', outputPath]`
3. **GREEN — `whisper-stt.service.ts`:**
   ```
   const tmpBase = config.get('WHISPER_TMP_DIR') ?? os.tmpdir();
   const dir = await mkdtemp(join(tmpBase, 'whisper-'));
   try {
     let wavPath = storage.absolutePath(input.storageKey);
     if (needsConversion(input.mimeType)) {
       wavPath = join(dir, 'input.wav');
       await runner.run(ffmpegBin, buildFfmpegArgs(storage.absolutePath(input.storageKey), wavPath));
     }
     const result = await runner.run(whisperBin, buildWhisperArgs({ inputPath: wavPath, ... }));
     return result.stdout.trim();
   } finally {
     await rm(dir, { recursive: true, force: true }).catch(() => undefined);
   }
   ```
   Путь `ffmpeg` — из `WHISPER_BIN_PATH`? Нет: `ffmpeg` берётся из `PATH` (просто `'ffmpeg'`), либо
   опциональный `FFMPEG_BIN_PATH` — **решение: `'ffmpeg'` из `PATH`**, отдельную env не вводим
   (минимум переменных; ресёрч R16 — `ffmpeg` ставится системно).
4. **GREEN — `.env.example`:** `WHISPER_TMP_DIR=` (комментарий: пусто → `os.tmpdir()`), + `turbo.json` / `ci.yml`.

### Гейты

- `pnpm --filter api test` и `pnpm --filter api test:e2e` — зелёные.
- `pnpm lint && pnpm typecheck`.
- **Ручная:** загрузка mp3 и mp4 с речью → `done` с реальным транскриптом; после `done` и после
  `failed` в `UPLOADS_DIR` и во временном каталоге не остаётся WAV-файлов.

### Коммит

`feat(api): convert non-WAV recordings to 16kHz mono WAV via ffmpeg`

---

## Фаза 3 — Бэкенд: устойчивость (ошибки, таймаут, остановка приложения)

**Цель:** любой сбой движка → `failed` без частичного транскрипта; `reprocess` перезапускает;
зависшая транскрибация обрывается по `WHISPER_TIMEOUT_MS`; подпроцесс убивается при остановке
приложения; очередь остаётся одним воркером.

### Файлы

| Действие | Путь |
|----------|------|
| EDIT | `apps/api/src/meeting-file/processing/process-runner.ts` — проброс `signal` в `spawn`, добивающий `SIGKILL` по grace-таймеру |
| EDIT | `apps/api/src/meeting-file/processing/whisper-stt.service.ts` — таймаут, `AbortSignal.any`, ветки ошибок, `existsSync` пред-проверки |
| EDIT | `apps/api/src/meeting-file/processing/whisper-stt.service.spec.ts` — ветки ошибок и `kill` |
| EDIT | `apps/api/src/meeting-file/processing/meeting-file-processing.queue.ts` — `AbortController` на текущую задачу, `abort()` в `onModuleDestroy` |
| NEW | `apps/api/src/meeting-file/processing/meeting-file-processing.queue.spec.ts` — интеграционные тесты очереди |
| EDIT | `apps/api/src/main.ts` — `app.enableShutdownHooks()` |
| EDIT | `apps/api/.env.example`, `turbo.json`, `.github/workflows/ci.yml` — `WHISPER_TIMEOUT_MS` |

### Шаги

1. **RED — `whisper-stt.service.spec.ts`:** по кейсу на ветку (мок `PROCESS_RUNNER`):
   - `existsSync(WHISPER_BIN_PATH) === false` → `rejects.toThrow(/binary/)` (раннер не вызван);
   - `existsSync(WHISPER_MODEL_PATH) === false` → `rejects.toThrow(/model/)`;
   - раннер `ffmpeg` → reject (ENOENT / ненулевой код) → `transcribe` reject, whisper не вызван;
   - раннер whisper → ненулевой код → reject;
   - `stdout` пустой/пробельный → `rejects.toThrow(/empty/)`;
   - таймаут: `WHISPER_TIMEOUT_MS` мал, раннер «висит» → reject по `AbortSignal.timeout`, раннер
     получил `opts.signal` (проверить, что передан);
   - внешний `input.signal` уже `aborted` → `transcribe` завершается reject, не запуская долгую работу.
2. **RED — `meeting-file-processing.queue.spec.ts`** (Prisma можно мокать — `{ provide: PrismaService, useValue }`,
   либо лёгкий фейк; `STT_SERVICE` — управляемый двойник):
   - `transcribe` бросает → файл `failed`, `transcriptText` не записан (`meetingFile.update` c `done` не вызван);
   - две задачи подряд: пока первая не завершилась, вторая не ушла в `processing` (`concurrency = 1`,
     проверка через порядок вызовов `stt.transcribe`);
   - `onModuleDestroy` во время активной задачи: `currentAbort.abort()` вызван, `await` завершается,
     запись в БД после этого не происходит (флаг `stopped`).
3. **GREEN — `process-runner.ts`:** `run(cmd, args, { signal, killGraceMs = 3000 })`:
   `const child = spawn(cmd, args, { signal });` на `signal` `abort` — таймер
   `setTimeout(() => child.kill('SIGKILL'), killGraceMs)`, снять таймер в `close`. Различать
   `AbortError` (проброс наверх) и ненулевой код.
4. **GREEN — `whisper-stt.service.ts`:**
   - до запуска: `if (!binPath || !existsSync(binPath)) throw new Error('whisper binary not found at ' + binPath);`
     то же для `modelPath`;
   - `const timeoutMs = Number(config.get('WHISPER_TIMEOUT_MS')) || 300_000;`
   - `const signal = AbortSignal.any([AbortSignal.timeout(timeoutMs), input.signal].filter(Boolean) as AbortSignal[]);`
     пробросить `signal` в оба вызова `runner.run`;
   - после whisper: `const text = result.stdout.trim(); if (!text) throw new Error('whisper produced empty transcript');`
   - `catch`: если сработал таймаут — `throw new Error('whisper timed out after ' + timeoutMs + 'ms')`;
     прочие — пробросить с внятным сообщением (код выхода + хвост stderr).
5. **GREEN — `meeting-file-processing.queue.ts`:**
   - поле `private currentAbort: AbortController | null = null;`
   - в `process()` перед `this.stt.transcribe(...)`: `this.currentAbort = new AbortController();`
     передать `signal: this.currentAbort.signal`; в `finally` внутреннего блока — `this.currentAbort = null;`
   - `onModuleDestroy` (стр. 84-90): порядок — `this.stopped = true;` → `this.pending.length = 0;`
     → `this.currentAbort?.abort();` → `if (this.current) await this.current.catch(() => undefined);`
6. **GREEN — `main.ts`:** `app.enableShutdownHooks();` перед `await app.listen(...)` (стр. 37).
7. **GREEN — `.env.example`:** `WHISPER_TIMEOUT_MS=300000`, + `turbo.json` / `ci.yml`.

### Гейты

- `pnpm --filter api test` и `pnpm --filter api test:e2e` — зелёные; e2e с `app.close()` в `afterEach`
  не висят.
- `pnpm lint && pnpm typecheck`.
- **Ручная:** смоделированные сбои (нет бинарника / нет модели / нет `ffmpeg` / ненулевой код whisper /
  таймаут / пустой вывод) → `failed` без `transcriptText`, затем `reprocess` доводит до `done`;
  процессов-сирот `whisper`/`ffmpeg` после остановки нет.

### Коммит

`feat(api): harden whisper transcription with timeout, error handling, graceful shutdown`

---

## Фаза 4 — Бэкенд: онбординг движка, env-валидация, документация

**Цель:** воспроизводимая установка модели `tiny`, проверка конфигурации на старте, синхронная
документация; дефолт `STT_ENGINE` переключён на `whisper`.

### Файлы

| Действие | Путь |
|----------|------|
| NEW | `apps/api/scripts/download-whisper-model.mjs` |
| EDIT | `apps/api/package.json` — скрипт `"whisper:model"` |
| EDIT | `.gitignore` — строка `apps/api/.whisper/` |
| EDIT | `apps/api/src/config/env.validation.ts` — проверка бинарника/модели при `STT_ENGINE=whisper` |
| NEW | `apps/api/src/config/env.validation.spec.ts` |
| EDIT | `apps/api/src/meeting-file/processing/stt.service.ts` — `DEFAULT_STT_ENGINE = 'whisper'` |
| NEW | `apps/api/src/meeting-file/CLAUDE.md` (English) |
| EDIT | `apps/api/CLAUDE.md` — выбор движка, зависимость от `ffmpeg`, стратегия тестов, стабильные env; сжать дубль абзацев про `processing` |
| EDIT | корневой `CLAUDE.md`, `README.md` — раздел «Переменные окружения» |
| EDIT | `apps/api/.env.example` — финализировать все `WHISPER_*` + `STT_ENGINE` с описанием |

### Шаги

1. **RED — `env.validation.spec.ts`:**
   - `STT_ENGINE=whisper`, нет `WHISPER_BIN_PATH`/`WHISPER_MODEL_PATH`, `NODE_ENV=production` → `validateEnv` бросает;
   - то же вне `production` → не бросает, только `logger.warn` (проверить через spy на `Logger.prototype.warn`);
   - `STT_ENGINE=stub` → проверок движка нет (нет warn/throw даже без путей);
   - `STT_ENGINE` не задан → трактуется как `DEFAULT_STT_ENGINE` (после этой фазы — `whisper`).
   - Для «путь задан, но файла нет» — можно указать несуществующий путь (сработает `existsSync`),
     реальные файлы не требуются.
2. **GREEN — `env.validation.ts`:** после блока `JWT_SECRET` (стр. 27) добавить:
   ```
   const engine = config.STT_ENGINE ?? DEFAULT_STT_ENGINE;
   if (engine === 'whisper') {
     const bin = typeof config.WHISPER_BIN_PATH === 'string' ? config.WHISPER_BIN_PATH : '';
     const model = typeof config.WHISPER_MODEL_PATH === 'string' ? config.WHISPER_MODEL_PATH : '';
     if (!bin || !existsSync(bin)) problems.push('WHISPER_BIN_PATH is missing or does not exist');
     if (!model || !existsSync(model)) problems.push('WHISPER_MODEL_PATH is missing or does not exist');
   }
   ```
   `import { existsSync } from 'node:fs';` Импорт `DEFAULT_STT_ENGINE` из `stt.service.js`
   (или вынести константу в `processing/stt-engine.ts`, чтобы `config/` не зависел от `meeting-file/`
   — **предпочтительно вынести**).
3. **GREEN — `scripts/download-whisper-model.mjs`:** читает `process.env.WHISPER_MODEL_PATH`
   (дефолт `./.whisper/ggml-tiny.bin`); если файл есть и размер > 0 — выходит; иначе `mkdir` каталога,
   `fetch('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin')`,
   `pipeline(response.body, createWriteStream(path))`; не-2xx → `process.exit(1)` с сообщением;
   печатает итоговый путь. Чистый ESM, без внешних пакетов.
4. **GREEN — `package.json`:** `"whisper:model": "node scripts/download-whisper-model.mjs"`.
5. **GREEN — `.gitignore`:** добавить `apps/api/.whisper/` рядом с блоком `apps/api/uploads/` (стр. 40-41).
6. **GREEN — `stt.service.ts` / `stt-engine.ts`:** `DEFAULT_STT_ENGINE: SttEngine = 'whisper'`.
7. **GREEN — документация:**
   - `apps/api/src/meeting-file/CLAUDE.md` (English): очередь (`concurrency = 1`, `OnModuleDestroy`,
     `AbortController`, durability), выбор движка по `STT_ENGINE` + фабрика `STT_SERVICE`, конвейер
     `ffmpeg → whisper.cpp`, временные файлы/очистка, порт `PROCESS_RUNNER`, стратегия тестов
     (мок раннера в unit, stub-override в e2e).
   - `apps/api/CLAUDE.md`: раздел «Онбординг STT-движка» (команды установки `whisper.cpp` / `ffmpeg`
     по ОС, `pnpm --filter api whisper:model`, `WHISPER_BIN_PATH` → `whisper-cli`); в разделе
     «Соглашения» сжать абзацы 179-181 до указателя на модульный `CLAUDE.md`; в разделе «Структура»
     упомянуть новый файл; дописать `STT_ENGINE`/`WHISPER_*` в перечень env (стр. 164).
   - корневой `CLAUDE.md` (раздел «Переменные окружения») и `README.md` — упомянуть новые env и
     команду загрузки модели.
   - `apps/api/.env.example` — финальные значения и комментарии для `STT_ENGINE=whisper`,
     `WHISPER_BIN_PATH`, `WHISPER_MODEL_PATH`, `WHISPER_LANGUAGE`, `WHISPER_TIMEOUT_MS`, `WHISPER_TMP_DIR`.
8. Проверить, что `.github/workflows/ci.yml` задаёт `STT_ENGINE=stub` в `env` — иначе после смены
   дефолта на `whisper` `validateEnv` в CI (`NODE_ENV=test`) даст лишний `warn` (не фатально, но
   шумно). **Явно выставить `STT_ENGINE: stub` в CI `env`.**

### Гейты

- `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter api test:e2e` — всё зелёное без
  whisper/`ffmpeg` (e2e на stub-override, CI `STT_ENGINE=stub`).
- **Ручная:** `pnpm --filter api whisper:model` кладёт `ggml-tiny.bin` в `WHISPER_MODEL_PATH`, файл
  не попадает в `git status`; при `STT_ENGINE=whisper` без бинарника/модели старт падает в
  `production` и предупреждает вне его; `.env.example` и все `CLAUDE.md` / `README.md` согласованы.

### Коммит

`feat(api): switch default STT engine to whisper, add model setup script and env validation`
(+ отдельным коммитом `docs: document local whisper transcription setup` — если удобно разнести код и доки)

---

## Фаза 5 — Веб: проверка UI и сквозной прогон

**Цель:** реальный движок не ломает существующий UI страницы встречи — «Обрабатывается» во время
работы Whisper, реальный разворачиваемый транскрипт после `done`, обновление поллингом без
перезагрузки, путь ошибки с кнопкой «Повторить».

### Шаги

1. **Подготовка:** `STT_ENGINE=whisper`, подготовленные `WHISPER_BIN_PATH` / `WHISPER_MODEL_PATH`,
   `ffmpeg` в `PATH`; dev-серверы web:3000 / api:3001 уже подняты (не запускать).
2. **Playwright MCP — happy path:** на `/meetings/[id]` загрузить реальную запись → карточка файла
   показывает «Обрабатывается», затем «Готово» без перезагрузки (существующий поллинг
   `POLL_INTERVAL_MS = 3000`, `meeting-files.tsx:30`); транскрипт разворачивается/сворачивается,
   содержит реальный текст. Проверить светлую/тёмную тему, мобильную/десктопную ширину, консоль без
   ошибок.
3. **Playwright MCP — путь ошибки:** временно указать недоступную модель или загрузить битый звук →
   статус «Ошибка обработки» + кнопка «Повторить»; после восстановления конфигурации «Повторить»
   доводит до «Готово».
4. **Правка UI — только при необходимости:** если реальный `processing` держится ощутимо долго и
   текущий текст дезориентирует — минимальная правка `STATUS_META` в
   `apps/web/src/components/meeting-files.tsx:37-42` (текст/индикатор), **без новых статусов и без
   изменения контракта `MeetingFile` / `MeetingFileStatus`**. После правки — повторная проверка в
   браузере + ревью по скиллу `ui-ux-pro-max` (контраст ≥ 4.5:1, тач-цели, иерархия) согласно
   `apps/web/CLAUDE.md` («Проверка UI-изменений»).
5. **Финальный прогон:** `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter api test:e2e`.

### Гейты

- В браузере: запись проходит «Обрабатывается» → «Готово» с реальным транскриптом без перезагрузки;
  путь ошибки показывает «Ошибка» и рабочую кнопку «Повторить».
- Все проверки (`lint`, `typecheck`, `test`, `test:e2e`) зелёные.

### Коммит

`chore(web): verify meeting page against real whisper engine` (+ правка `meeting-files.tsx`, если делалась)

---

## Определение готовности всей фичи (сверка с PRD «Критерии готовности»)

- [ ] `STT_ENGINE=whisper` + короткий WAV → `pending → processing → done`, реальные слова в
  `transcriptText` (Фаза 1, ручная).
- [ ] `whisper.cpp` как подпроцесс с моделью `tiny`, без Python (Фаза 1).
- [ ] не-WAV (mp3/m4a/webm/mp4) транскрибируется через `ffmpeg`; после `done`/`failed` нет WAV-сирот
  в `UPLOADS_DIR` и во временном каталоге (Фаза 2).
- [ ] `WHISPER_LANGUAGE` пусто → авто; `ru` → русский; описано в `.env.example` (Фазы 1, 4).
- [ ] каждый сбой → `failed` без частичного `transcriptText`, затем `reprocess` перезапускает
  (Фаза 3).
- [ ] `STT_ENGINE=stub` / e2e-override — прежнее заглушечное поведение (Фазы 1-4).
- [ ] идущая транскрибация убивается при остановке приложения; e2e `afterEach` не висит; нет сирот
  (Фаза 3).
- [ ] очередь — один воркер: две записи подряд обрабатываются последовательно (Фаза 3, интеграционный
  тест очереди).
- [ ] `pnpm --filter api test` содержит тесты `WhisperSttService` (аргументы, парсинг, каждая ветка
  ошибок) на замоканном `PROCESS_RUNNER` (Фазы 1-3).
- [ ] `pnpm --filter api test:e2e` зелёный на stub без whisper/`ffmpeg` (все фазы).
- [ ] страница встречи: «Обрабатывается» → реальный разворачиваемый транскрипт, поллинг без
  перезагрузки (Фаза 5, браузер).
- [ ] `.env.example` документирует `STT_ENGINE`, `WHISPER_BIN_PATH`, `WHISPER_MODEL_PATH`,
  `WHISPER_LANGUAGE`, `WHISPER_TIMEOUT_MS`; есть скрипт загрузки модели `tiny`; модель в `.gitignore`
  (Фаза 4).
- [ ] обновлены `apps/api/CLAUDE.md`, `apps/api/src/meeting-file/CLAUDE.md`, корневой `CLAUDE.md`,
  `README.md` (Фаза 4).

---

## Порядок веток / PR

Один PR на всю фичу (документация тем же PR — требование `CLAUDE.md`), коммиты по фазам. Перед
финальным пушем: `docker compose up -d postgres` и полный локальный прогон
`pnpm lint && pnpm typecheck && pnpm test && pnpm --filter api test:e2e` (совпадает с pre-commit
хуком husky).
