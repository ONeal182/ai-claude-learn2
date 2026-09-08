# CLAUDE.md — meeting-file

CQRS module for the nested resource `/meetings/:meetingId/files` (controller under `@UseGuards(JwtAuthGuard)`).
Upload / list / download / delete of meeting attachments and recordings, plus background transcription
of recordings. Cross-cutting API rules live in `apps/api/CLAUDE.md`; this file owns the module's logic.

## Storage

Binaries live on disk in `UPLOADS_DIR` (flat, filename = random uuid = `storageKey`); the DB row
(`meeting_files`) holds only metadata + `storageKey`. All filesystem access goes through
`FileStorageService` from `StorageModule` — never touch `fs` in handlers. Upload uses
`FileInterceptor('file')` + `MulterModule.registerAsync` (memoryStorage, `limits.fileSize` from
`MAX_UPLOAD_SIZE_BYTES` → 413; `fileFilter` from `allowed-mime.ts` → 400). The binary is written in the
command handler _after_ the meeting is confirmed to exist, so a 404/400 leaves no orphan.

Rejection order: `JwtAuthGuard` (401) → multer `limits`/`fileFilter` (413/400) → `GetMeetingByIdQuery` (404).

Deliberate limits this iteration: client `Content-Type` is trusted (no content sniffing / AV);
`onDelete: Cascade` on meeting deletion leaves orphan binaries (meeting deletion is out of scope);
queue/file durability across restarts is not guaranteed; with multiple API instances the upload dir
is not shared. Non-ASCII multipart filenames are re-decoded `latin1 → utf8` in the controller;
downloads are `StreamableFile` with an RFC 5987 `Content-Disposition`.

## MeetingFile fields

- **`summaryStatus`** (`MeetingFileStatus | null`) — lifecycle state of automatic summarization
  (`pending → processing → done | failed`). Populated only for `recording` files that have been
  transcribed; `null` for `attachment` files and recordings without a transcript.
- **`summary`** (`Json | null`) — structured summary of the meeting recording, shape
  `{ summary: string, decisions: string[], actionItems: string[] }`. Populated when
  `summaryStatus = done`; `null` otherwise.

## Background transcription (`processing/`)

Both entry points funnel through one domain event `MeetingFileProcessingRequestedEvent { fileId }`:
`CreateMeetingFileHandler` publishes it for a freshly uploaded `recording` (the "does this need
processing?" decision lives with the publisher); `ReprocessMeetingFileHandler` publishes it after an
atomic `failed → pending` reset. `MeetingFileProcessingRequestedHandler` unconditionally enqueues the
`fileId`.

When a recording reaches `status = done` with a non-empty `transcriptText`, the transcription queue
publishes `MeetingFileTranscribedEvent { fileId }`. This event triggers automatic summarization.

**Queue** (`meeting-file-processing.queue.ts`) — in-process, no external broker, `concurrency = 1`.
Drives `pending → processing → done | failed` and writes `transcriptText` on success. It holds an
`AbortController` for the current job; `onModuleDestroy` order is `stopped = true` → clear pending →
`currentAbort.abort()` → `await current`. `OnModuleDestroy` is mandatory: e2e call `app.close()` in
`afterEach`, and a "burning-down" job must not write to a disconnected `PrismaClient`. A row deleted
mid-processing surfaces as Prisma `P2025` and is swallowed. Durability across restarts is not
guaranteed — stuck `pending`/`processing` rows are not resumed.

**Engine selection.** `SttService` (token `STT_SERVICE`) has two implementations, chosen by a
`useFactory` in `MeetingFileModule` keyed on `STT_ENGINE` (`whisper` | `stub`). `processing/stt-engine.ts`
is dependency-free (so both the factory and `config/`'s `validateEnv` import it without coupling
layers) and owns the single resolver `resolveSttEngine(raw)`: blank/whitespace → `DEFAULT_STT_ENGINE`
(**`whisper`** since phase 4), an unknown value → `throw`. Use it on both sides — never re-derive with
ad-hoc `??`/`||`.

- `StubSttService` — deterministic stub, transcript derived from file metadata, no content read, no
  `NODE_ENV` branching. Used in every e2e run via `.overrideProvider(STT_SERVICE)` (a double that
  fails on the `__stt_fail__` filename marker) — production carries no test branches. `test/setup-e2e.ts`
  sets `STT_ENGINE=stub` so `validateEnv` stays quiet while AppModule boots.
- `WhisperSttService` — real transcription via whisper.cpp (`whisper-cli`) as an external subprocess
  (no Python) through the injectable `PROCESS_RUNNER` port (`SpawnProcessRunner` over
  `child_process.spawn`, zero new npm deps).

**Pipeline.** `WhisperSttService.transcribe(input)`:

1. Pre-flight: `existsSync(WHISPER_BIN_PATH)` / `existsSync(WHISPER_MODEL_PATH)` — empty or missing
   file → `throw` before any temp dir is created.
2. `mkdtemp` a per-job dir under `WHISPER_TMP_DIR` (empty → `os.tmpdir()`).
3. Non-WAV input (`needsConversion` by mime — anything but `audio/wav` / `audio/x-wav`) → `ffmpeg`
   (`-ar 16000 -ac 1 -c:a pcm_s16le`, from `PATH`, no dedicated env) into the job dir; WAV skips this.
4. `whisper-cli -m <model> -l <WHISPER_LANGUAGE | auto> -nt -f <wav>`; transcript is `stdout.trim()`.
   Empty → `throw new Error('whisper produced empty transcript')`.
5. `finally`: `rm(jobDir, { recursive: true, force: true })` on every post-`mkdtemp` path — no
   orphan WAVs after `done` or `failed`.

**Resilience.** One transcription is bounded by `WHISPER_TIMEOUT_MS` (`resolveTimeoutMs` clamps to a
finite `> 0`; empty / `0` / negative / non-numeric → `300000`). Implemented as
`AbortSignal.any([AbortSignal.timeout(ms), input.signal])` passed into both `PROCESS_RUNNER` calls.
On abort `spawn` sends `SIGTERM`; if the child outlives `killGraceMs` (default 3000) `SpawnProcessRunner`
sends `SIGKILL`. A child that exits via signal reports `code === null` → the runner **rejects** (never
a false success with a partial transcript). In `transcribe`, a fired timeout is relabelled
`whisper timed out after <ms>ms`; every other failure rethrows with a clear message. The worker turns
any throw into `failed` with no `transcriptText`; `POST .../reprocess` restarts it.

Graceful shutdown depends on `app.enableShutdownHooks()` in `main.ts` — without it `SIGTERM`/`SIGINT`
would not fire `OnModuleDestroy` and `whisper`/`ffmpeg` children would be orphaned on restart.

**`POST /meetings/:id/files/:fileId/reprocess`** — atomic
`updateMany({ where: { status: failed }, data: { status: pending, transcriptText: null, summaryStatus: null, summary: null } })`;
`count === 0` → `409 Conflict` (a race / wrong status never double-enqueues), otherwise the event fires.
Resets both transcript and summary fields; a fresh `done` status will trigger `MeetingFileTranscribedEvent`
and rebuild the summary. Rejection order: `JwtAuthGuard` (401) → `GetMeetingByIdQuery` / `GetMeetingFileQuery` (404) → wrong status (409).

**`POST /meetings/:id/files/:fileId/resummarize`** — manual re-summarization. Checks: 404 if meeting or
file does not exist; 409 (`ConflictException`) if `type !== recording`, `status !== done`, `transcriptText`
is empty, or `summaryStatus === processing`. Otherwise atomically sets `summaryStatus = pending` and
publishes the event that enqueues into `MeetingFileSummaryQueue`. Rejection order: `JwtAuthGuard` (401) →
`GetMeetingFileQuery` (404) → precondition checks (409). Returns 200 on success.

## Background summarization (`processing/`)

After a `recording` is successfully transcribed (`status = done`, non-empty `transcriptText`),
`MeetingFileProcessingQueue` publishes `MeetingFileTranscribedEvent { fileId }`.
`MeetingFileTranscribedHandler` enqueues the file into `MeetingFileSummaryQueue` — a second in-process
worker (`concurrency = 1`) that drives `summaryStatus: pending → processing → done | failed` and writes
the `summary` JSON on success. Only `recording` files with a transcript are processed; `attachment`
files and recordings without `transcriptText` are skipped without status changes.

**Queue** (`MeetingFileSummaryQueue`) — mirrors the transcription queue: in-process, no external broker,
`concurrency = 1`. Holds an `AbortController` for the active job; `onModuleDestroy` order is
`stopped = true` → clear pending → `currentAbort.abort()` → `await current`. A row deleted
mid-processing surfaces as Prisma `P2025` and is swallowed. Durability across restarts is not
guaranteed — stuck `pending`/`processing` rows are not resumed.

**Failed status branch.** Any exception thrown by `SUMMARY_SERVICE.summarize()` (authentication
failure, SDK not installed, network error, invalid response, schema mismatch) causes the queue worker
to transition the file to `summaryStatus = failed` without writing partial `summary` data. The worker
continues to the next queued file. Users can retry via `POST .../resummarize` (Phase 3).

**Engine selection.** `SummaryService` (token `SUMMARY_SERVICE`) has two implementations, chosen by a
`useFactory` in `MeetingFileModule` keyed on `SUMMARY_ENGINE` (`claude` | `stub`). Default is `claude`.

- `StubSummaryService` — deterministic stub, summary derived from file metadata. Used in e2e tests
  via `process.env.SUMMARY_ENGINE = 'stub'` set in `test/setup-e2e.ts`.
- `ClaudeSummaryService` — real summarization via `ClaudeAgentService` (requires `ClaudeAgentModule`
  import). System prompt in Russian, requires strict JSON response shape
  `{ "summary": string, "decisions": string[], "actionItems": string[] }` without markdown blocks or
  additional explanations. Response parsing: extracts JSON from potential markdown code blocks,
  validates structure (summary must be non-empty string, decisions/actionItems must be string arrays).
  Any error (authentication failure, SDK not installed, invalid JSON, wrong schema, empty summary) →
  `summaryStatus = failed` without partial data. Successful summarization logs decision/action item counts.

**Environment variables:**

- `SUMMARY_ENGINE` (`claude` | `stub`, default `claude`) — summarization backend. Declared in
  `.env.example`, `turbo.json → globalPassThroughEnv`, and `.github/workflows/ci.yml → env`.
  CI uses `stub` to avoid requiring Anthropic API credentials.
- `CLAUDE_AGENT_MODEL` (from `claude-agent` module) — model used by `ClaudeSummaryService` when
  `SUMMARY_ENGINE=claude`, defaults to `claude-haiku-4-5`.
- `ANTHROPIC_API_KEY` (from `claude-agent` module) — API key for Claude Agent SDK. Optional: when
  absent, `ClaudeAgentService` uses ambient Claude Code login (OAuth creds from `~/.claude`).

## Tests

- Unit: `PROCESS_RUNNER` is a `vi.fn()` double — no real whisper.cpp/ffmpeg. `whisper-command.spec.ts`
  covers pure arg building; `whisper-stt.service.spec.ts` covers the pipeline + every failure branch;
  `meeting-file-processing.queue.spec.ts` covers `failed` without transcript, `concurrency = 1`, and
  `onModuleDestroy` aborting the active job (Prisma is a light `vi.fn()` fake).
- e2e (`test/meeting-files.e2e-spec.ts`): always on the stub override; whisper.cpp/ffmpeg are never
  needed in CI or pre-commit. Isolated `UPLOADS_DIR` (temp dir, removed in `afterAll`) and a small
  `MAX_UPLOAD_SIZE_BYTES` to check 413 cheaply.

## Onboarding the whisper engine

`STT_ENGINE=stub` needs nothing. For `STT_ENGINE=whisper`:

- **whisper.cpp** — build `whisper-cli` (`git clone https://github.com/ggerganov/whisper.cpp && cd
whisper.cpp && cmake -B build && cmake --build build -j`), point `WHISPER_BIN_PATH` at
  `build/bin/whisper-cli` (any absolute path is fine).
- **ffmpeg** — from the system package manager (`apt install ffmpeg` / `brew install ffmpeg`); must be
  on `PATH`. Only needed for non-WAV recordings.
- **Model** — `pnpm --filter api whisper:model` downloads `ggml-tiny.bin` to `WHISPER_MODEL_PATH`
  (default `apps/api/.whisper/ggml-tiny.bin`; `.whisper/` is git-ignored). Idempotent.

With `STT_ENGINE=whisper` and a missing binary/model, `validateEnv` throws on boot in `production`
and only warns elsewhere.
