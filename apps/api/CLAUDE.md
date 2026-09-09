# CLAUDE.md — apps/api

NestJS 12, TypeScript, **pure ESM** (`"type": "module"`). Linter: oxlint, tests: vitest. Dev port **3001**.
DB: Postgres via **Prisma 7** (no-rust-engine, driver adapter `@prisma/adapter-pg`).

## Commands

Run from root (`pnpm api <script>`) or this directory:

| Command              | Action                                                    |
| -------------------- | --------------------------------------------------------- |
| `pnpm dev`           | `nest start --watch` (port 3001)                          |
| `pnpm build`         | `nest build` → `dist/`                                    |
| `pnpm start:prod`    | `node dist/main` (after build)                            |
| `pnpm lint`          | `oxlint src/ test/`                                       |
| `pnpm typecheck`     | `tsc --noEmit`                                            |
| `pnpm test`          | vitest unit tests (`**/*.spec.ts`)                        |
| `pnpm test:e2e`      | vitest e2e tests (requires Postgres)                      |
| `pnpm whisper:model` | Download `ggml-tiny.bin` model (for `STT_ENGINE=whisper`) |
| `pnpm seed`          | Populate DB with test data (user, meetings, files, tasks) |

Prisma (config in `prisma.config.ts`, not `datasource.url` in schema — Prisma 7):

| Command                                      | Action                                     |
| -------------------------------------------- | ------------------------------------------ |
| `pnpm exec prisma migrate dev --name <name>` | Create + apply migration + generate client |
| `pnpm exec prisma generate`                  | Regenerate Prisma Client                   |
| `pnpm exec prisma studio`                    | GUI for DB                                 |

## Structure

```
prisma/
├── schema.prisma       # User, Meeting, MeetingFile, Task + enums; Meeting.summary (Text), Meeting.decisions (Json), Meeting.summaryStatus
├── migrations/         # Migration history
├── seed.ts             # Test data seeding (test@example.com / test123456, meetings, files, tasks)
└── seed.mjs            # Alternative seed (unused)
prisma.config.ts        # datasource url (Prisma 7)
src/
├── main.ts             # Bootstrap: CORS, shutdown hooks, listen(PORT ?? 3001)
├── app.module.ts       # Root: ConfigModule.forRoot({ validate: validateEnv }), PrismaModule, all feature modules, global ValidationPipe
├── config/
│   └── env.validation.ts       # validateEnv: STT_ENGINE=whisper requires WHISPER_BIN_PATH/MODEL_PATH (production: throw, else: warn)
├── prisma/
│   ├── prisma.module.ts    # @Global, exports PrismaService
│   └── prisma.service.ts   # PrismaClient + PrismaPg adapter, lifecycle hooks
├── users/               # CQRS: owns User entity (create, find, update); no auth logic
│   ├── commands/impl/      # CreateUserCommand { email, passwordHash }, UpdateUserProfileCommand, UpdateUserPasswordCommand, UpdateUserAvatarCommand
│   ├── commands/handlers/  # Prisma user CRUD
│   └── queries/            # FindUserByEmailQuery, FindUserByIdQuery, FindUserByAvatarKeyQuery (single source of truth for User reads)
├── auth/                # CQRS: tokens + credentials; doesn't store User directly (uses QueryBus/CommandBus → users module)
│   ├── auth.controller.ts  # POST /auth/register, /auth/login
│   ├── commands/           # RegisterCommand, LoginCommand, ChangePasswordCommand
│   ├── commands/handlers/  # Hash/verify (bcryptjs), issue JWT, publish events
│   ├── guards/jwt-auth.guard.ts  # Validates Bearer token, sets request.user { userId, email }
│   └── services/auth-token.service.ts  # issue(user) → { accessToken }
├── storage/             # Not CQRS: reusable file storage
│   └── file-storage.service.ts  # save/exists/createReadStream/remove/absolutePath; flat layout in UPLOADS_DIR; security: resolvePath barrier
├── profile/             # CQRS: ProfileController (@UseGuards(JwtAuthGuard)), AvatarController (public)
│   ├── profile.controller.ts # GET/PATCH /users/me, POST /users/me/password, PUT /users/me/avatar
│   ├── avatar.controller.ts  # Public GET /users/avatars/:key → StreamableFile
│   ├── avatar-mime.ts        # AVATAR_MIME_TO_EXT (jpeg/png/webp) + reverse map
│   ├── commands/           # UploadAvatarCommand
│   ├── commands/handlers/  # UploadAvatarHandler: write <uuid>.<ext>, UpdateUserAvatarCommand, remove old file
│   ├── queries/            # GetProfileQuery, GetAvatarContentQuery
│   └── dto/profile.dto.ts  # toProfileDto: avatarUrl = avatarKey ? '/users/avatars/'+avatarKey : null
├── meeting/             # CQRS: @UseGuards(JwtAuthGuard)
│   ├── meeting.controller.ts  # POST/GET /meetings, GET /meetings/:id
│   ├── commands/           # CreateMeetingCommand { title, startsAt }
│   └── queries/            # ListMeetingsQuery, GetMeetingByIdQuery (throws 404)
├── meeting-file/        # CQRS: nested /meetings/:meetingId/files, @UseGuards(JwtAuthGuard). Details: src/meeting-file/CLAUDE.md
│   ├── CLAUDE.md           # File storage + background transcription pipeline + whisper onboarding + auto-summarization
│   ├── meeting-file.controller.ts # POST/GET /, GET/:fileId/content, POST/:fileId/reprocess, POST/:fileId/resummarize, DELETE/:fileId
│   ├── allowed-mime.ts     # ALLOWED_UPLOAD_MIME_TYPES whitelist
│   ├── processing/
│   │   ├── stt-engine.ts         # SttEngine + DEFAULT_STT_ENGINE ('whisper' since Phase 4) + resolveSttEngine
│   │   ├── stt.service.ts        # STT_SERVICE token + SttService interface; StubSttService (deterministic)
│   │   ├── whisper-stt.service.ts # WhisperSttService: whisper.cpp subprocess; non-WAV → ffmpeg; WHISPER_TIMEOUT_MS; cleanup
│   │   ├── meeting-file-processing.queue.ts # In-process worker (concurrency 1): pending→processing→done|failed; AbortController + OnModuleDestroy
│   │   ├── summary-engine.ts     # SummaryEngine + DEFAULT_SUMMARY_ENGINE ('claude' since Phase 2) + resolveSummaryEngine
│   │   ├── summary.service.ts    # SUMMARY_SERVICE token + SummaryService interface; StubSummaryService
│   │   ├── claude-summary.service.ts # ClaudeSummaryService: calls ClaudeAgentService with Russian prompt; strict JSON { summary, decisions, actionItems }
│   │   └── meeting-summary.queue.ts # In-process worker (concurrency 1): summaryStatus pending→processing→done|failed; AbortController + OnModuleDestroy
│   ├── commands/           # CreateMeetingFileCommand, DeleteMeetingFileCommand, ReprocessMeetingFileCommand, ResummarizeMeetingFileCommand
│   ├── commands/handlers/  # Storage + Prisma + event publishing
│   ├── queries/            # ListMeetingFilesQuery, GetMeetingFileQuery (404), GetMeetingFileContentQuery
│   ├── events/             # MeetingFileProcessingRequestedEvent, MeetingFileTranscribedEvent
│   └── dto/meeting-file.dto.ts  # toMeetingFileDto (excludes storageKey); includes summaryStatus + summary
├── claude-agent/        # Not CQRS: wrapper over @anthropic-ai/claude-agent-sdk (lazy-loaded). Details: src/claude-agent/CLAUDE.md
│   ├── CLAUDE.md           # ClaudeAgentService, lazy SDK loading, unit tests, env
│   ├── claude-agent.service.ts  # run/ask (SDK query(), tools via options.tools, maxTurns default 1); lazy import() SDK; throws ClaudeAgentError if SDK not installed
│   └── meeting-tools.ts    # MCP tools: find_tasks, upsert_task, update_meeting; createMeetingMcpServer(prisma, taskService)
└── task/                # Not CQRS: simple service for Task entity
    ├── task.module.ts      # Provides/exports TaskService
    └── task.service.ts     # search(query): case-insensitive title search; upsert(dto): create or update Task
test/
├── *.e2e-spec.ts        # E2E tests: auth, meetings, meeting-files (upload/transcription/reprocess), profile, avatar
└── setup-e2e.ts         # vitest setupFiles: STT_ENGINE ??= 'stub' before AppModule load
scripts/
└── download-whisper-model.mjs # Idempotent ggml-tiny.bin download (pure ESM)
```

## Conventions

- **ESM**: relative imports require `.js` extension (e.g. `import { AppModule } from './app.module.js'`) even for `.ts` files (`nodenext` resolution).
- Standard Nest architecture: module → controller → service; DI via constructor.
- Generate resources: `pnpm exec nest g resource <name>`.
- `strict: true`, but `strictPropertyInitialization: false` (for DI + decorators).
- vitest with `globals: true` — `describe/it/expect` without imports.
- **Config**: env vars via `.env` (template: `.env.example`). Read only through `ConfigService`, never `process.env` directly. `ConfigModule.forRoot({ validate: validateEnv })` in `AppModule`. New env var → update 3 places: `.env.example`, `turbo.json` → `globalPassThroughEnv`, `.github/workflows/ci.yml` → `env`.
- **CORS**: enabled globally (`app.enableCors()`) for `apps/web` browser access.
- **Validation**: global `ValidationPipe` (`class-validator`/`class-transformer`) via `APP_PIPE` in `AppModule`.
- **Auth**: passwords via `bcryptjs`. JWT via `@nestjs/jwt`, config from `JWT_SECRET`/`JWT_EXPIRES_IN`. Protected endpoints: import `AuthModule`, add `@UseGuards(JwtAuthGuard)`. Guard sets `request.user { userId, email }`. Missing/invalid token → 401.
- **CQRS**: one `CqrsModule.forRoot()` per app (in `AuthModule`, `global: true`). Other CQRS modules only register handlers in `providers`. Structure: `commands/{impl,handlers}`, `queries/{impl,handlers}`, `events/{impl,handlers}` + barrel exports. Read state via `QueryBus`, even inside command handlers. Publish side effects via `EventBus`.
- **Module boundaries (auth/users)**: `auth` doesn't touch User directly — uses `CommandBus`/`QueryBus` to `users` module. `users` doesn't import `auth` and knows nothing about passwords/JWT — accepts pre-hashed `passwordHash`. Hashing/verification in `auth` (`bcryptjs`). Connection only via CQRS bus.
- **Prisma**: models in `prisma/schema.prisma`, connection URL only in `prisma.config.ts` (Prisma 7). Client uses `@prisma/adapter-pg` driver adapter. Seed script (`prisma/seed.ts`) configured in `prisma.config.ts` → runs via `pnpm seed` or `pnpm exec prisma db seed`, requires `tsx` (dev dependency).
- **File storage (`storage`)**: `FileStorageService` — single FS access point for all uploads (meeting files, avatars): `save/exists/createReadStream/remove/absolutePath`. Flat layout `${UPLOADS_DIR}/${storageKey}`. Security: `resolvePath` barrier prevents path traversal (empty key, `..`, separators, absolute paths → `BadRequestException`). Exported via `StorageModule`.
- **Meeting files (`meeting-file`)**: binaries on disk (flat, uuid key), metadata in DB. Multipart via `FileInterceptor` + `MulterModule` (memoryStorage, `MAX_UPLOAD_SIZE_BYTES`). Rejection order: `JwtAuthGuard` (401) → multer limits/filter (413/400) → handler (404). Trust client `Content-Type`. Known limitations: no content detection/antivirus; cascade delete leaves orphan files; no shared storage across instances.
- **Background processing (`meeting-file/processing`)**: detailed in `src/meeting-file/CLAUDE.md`. Entry via `MeetingFileProcessingRequestedEvent`. `MeetingFileProcessingQueue`: in-process worker (concurrency 1), `pending → processing → done|failed`, `AbortController` per task, abort in `OnModuleDestroy`. `STT_SERVICE`: `useFactory` by `STT_ENGINE` (`stub`|`whisper`, default `whisper`). `WhisperSttService`: runs `ffmpeg` + `whisper-cli` as subprocesses via `PROCESS_RUNNER`, timeout `WHISPER_TIMEOUT_MS`, grace SIGKILL, temp cleanup. Any failure → `failed` without partial transcript.
- **Background summarization (`meeting-file/processing`)**: detailed in `src/meeting-file/CLAUDE.md`. After transcription (`status=done`, non-empty `transcriptText`), `MeetingFileTranscribedEvent` triggers `MeetingFileSummaryQueue`: in-process worker (concurrency 1), `summaryStatus: pending → processing → done|failed`, `AbortController`, abort in `OnModuleDestroy`. `SUMMARY_SERVICE`: `useFactory` by `SUMMARY_ENGINE` (`claude`|`stub`, default `claude`). `ClaudeSummaryService`: calls `ClaudeAgentService` with Russian system prompt, requires strict JSON `{ summary: string, decisions: string[], actionItems: string[] }`, parses/validates, any error → `failed` without partial data. Auth: `ANTHROPIC_API_KEY` set → passed to SDK, unset → ambient Claude Code OAuth. Model: `CLAUDE_AGENT_MODEL` or default `claude-haiku-4-5`.
- **Claude Agent SDK (`claude-agent`)**: detailed in `src/claude-agent/CLAUDE.md`. `@anthropic-ai/claude-agent-sdk` **not in dependencies** (large package) — lazy-loaded via `await import()` with string specifier. Until installed, `run()`/`ask()` throw `ClaudeAgentError` ("not installed — run `pnpm --filter api add @anthropic-ai/claude-agent-sdk`"). `ClaudeAgentService` wraps SDK `query()` for one-shot requests (`tools: []`, `settingSources: []`, `maxTurns: 1`). Auth (when SDK installed): `ANTHROPIC_API_KEY` set → passed via `options.env` (replaces environment, so `process.env` merged first), unset → ambient Claude Code OAuth. API errors (no credits, rate limit) → result with `isError: true`, not thrown. Model: `CLAUDE_AGENT_MODEL` or default `claude-haiku-4-5`. Unit test (`*.spec.ts`): verifies `service.model` and throws `ClaudeAgentError` when SDK not installed; no network/subprocesses — green on CI/pre-commit.
- **E2E + files**: `test/meeting-files.e2e-spec.ts` overrides `UPLOADS_DIR` to `os.tmpdir()` in `beforeAll`, cleans in `afterAll`. `test/setup-e2e.ts` sets `STT_ENGINE ??= 'stub'` before `AppModule` import so `validateEnv` doesn't warn.

## Documentation Updates

When changing `api` architecture, update this file in the same commit:

- New top-level module/resource, `src/` structure change → "Structure" section
- New ESM/DI/config/test rules, `tsconfig`/`nest-cli.json` changes → "Conventions" section
- New/renamed scripts, port → "Commands" table (+ root `CLAUDE.md` if shared pipeline affected)
- New env vars → `.env.example` + "Conventions" section
- Module-specific logic (`src/<module>/`) → its own `src/<module>/CLAUDE.md` (English); this file keeps only pointers from "Structure"/"Conventions". Cross-module rules stay here.
