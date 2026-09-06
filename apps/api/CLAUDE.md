# CLAUDE.md — apps/api

NestJS 12, TypeScript, **pure ESM** (`"type": "module"`). Lint — oxlint, tests — vitest. Dev port **3001**.
DB — Postgres via **Prisma 7** (no-rust-engine, driver adapter `@prisma/adapter-pg`).

## Commands

Run from the root (`pnpm api <script>`) or from this folder:

| Command           | Action                                       |
| ----------------- | -------------------------------------------- |
| `pnpm dev`        | `nest start --watch` (port 3001)             |
| `pnpm start`      | `nest start`                                 |
| `pnpm start:prod` | `node dist/main` (after `build`)             |
| `pnpm build`      | `nest build` → `dist/`                       |
| `pnpm lint`       | `oxlint src/ test/`                          |
| `pnpm typecheck`  | `tsc --noEmit -p tsconfig.json`              |
| `pnpm test`       | `vitest run` (files `**/*.spec.ts`)          |
| `pnpm test:watch` | `vitest`                                     |
| `pnpm test:cov`   | `vitest run --coverage`                      |
| `pnpm test:e2e`   | `vitest run --config ./vitest.config.e2e.ts` |

Prisma commands, schema, migrations, and access rules — in [`.claude/rules/prisma.md`](../../.claude/rules/prisma.md).

## Modules

Cross-cutting rules — below in "Conventions". A module with non-trivial behaviour keeps its logic
(structure + rules) in its own `src/<module>/CLAUDE.md`; here — one row and a link.

| Module             | What it does                                                                                       | Documented                                           |
| ------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `src/prisma/`      | `@Global` `PrismaService` (PrismaClient + PrismaPg adapter, `$connect`/`$disconnect` on lifecycle) | [`.claude/rules/prisma.md`](../../.claude/rules/prisma.md) |
| `src/auth/`        | CQRS; tokens and credential verification, **not** `User` storage; `JwtAuthGuard`, `AuthTokenService`, events | here                                       |
| `src/users/`       | CQRS; owner of the `User` entity (Prisma) — create, find, update profile; no passwords/tokens     | here                                                 |
| `src/storage/`     | not CQRS; `FileStorageService` — the single point of filesystem access for every uploaded binary  | here                                                 |
| `src/meeting/`     | CQRS; meeting CRUD behind `JwtAuthGuard`, `MeetingCreatedEvent`                                    | here                                                 |
| `src/profile/`     | CQRS; `GET`/`PATCH /users/me`, `PUT /users/me/avatar`, public `GET /users/avatars/:key`            | [`src/profile/CLAUDE.md`](src/profile/CLAUDE.md)      |
| `src/meeting-file/`| CQRS; nested `/meetings/:id/files`, upload to disk, background recording processing (STT stub)     | [`src/meeting-file/CLAUDE.md`](src/meeting-file/CLAUDE.md) |

## Structure

```
prisma/
├── schema.prisma       # models (User, Meeting, MeetingFile) + enums MeetingFileType / MeetingFileStatus
└── migrations/
prisma.config.ts         # datasource url (env DATABASE_URL) — Prisma 7 does not read url from schema.prisma
src/
├── main.ts             # bootstrap, app.enableCors(), app.listen(PORT ?? 3001)
├── app.module.ts       # root module (ConfigModule, PrismaModule, UsersModule, AuthModule, MeetingModule, MeetingFileModule, ProfileModule, global ValidationPipe)
├── app.controller.ts   # GET /
├── prisma/
│   ├── prisma.module.ts    # @Global, exports PrismaService
│   └── prisma.service.ts   # PrismaClient + PrismaPg adapter, $connect/$disconnect on lifecycle
├── users/              # CQRS; owns the User entity — create, find, update profile, no tokens/password checks
│   ├── users.module.ts     # only registers handlers; no link to auth — interaction via the shared CommandBus/QueryBus
│   ├── commands/           # CreateUserCommand { email, passwordHash }; UpdateUserProfileCommand { userId, name };
│   │                       # UpdateUserAvatarCommand { userId, avatarKey } → prisma.user.create / update
│   └── queries/            # FindUserBy{Email,Id,AvatarKey}Query — the only points that read User from Prisma
├── auth/               # CQRS; controller with no business logic; tokens and credential verification, not User storage
│   ├── auth.module.ts      # CqrsModule.forRoot() + JwtModule.registerAsync + handlers; exports JwtAuthGuard and JwtModule
│   ├── auth.controller.ts  # POST /auth/register, /auth/login — only CommandBus.execute(...)
│   ├── commands/           # RegisterCommand, LoginCommand { email, password } — hash/verify password (bcryptjs),
│   │                       # find/create User over the bus → users, publish events, issue token
│   ├── events/             # UserRegisteredEvent, UserLoggedInEvent — handlers currently just log
│   ├── guards/jwt-auth.guard.ts        # verifies `Authorization: Bearer <JWT>`, puts { userId, email } on request.user
│   ├── services/auth-token.service.ts  # issue(user) → { accessToken }
│   └── dto/                # register.dto.ts (email, password min 8), login.dto.ts
├── storage/            # reusable file storage (not CQRS)
│   ├── storage.module.ts        # provides and exports FileStorageService; imported by meeting-file and profile
│   └── file-storage.service.ts  # save/exists/createReadStream/remove, key = uuid, mkdir(UPLOADS_DIR) in onModuleInit
├── profile/            # → src/profile/CLAUDE.md
├── meeting/            # CQRS; whole controller behind @UseGuards(JwtAuthGuard) (imports AuthModule)
│   ├── meeting.module.ts      # imports: [AuthModule]; handlers (CqrsModule comes from auth, forRoot not duplicated)
│   ├── meeting.controller.ts  # POST /meetings, GET /meetings, GET /meetings/:id — only CommandBus/QueryBus
│   ├── commands/              # CreateMeetingCommand { title, startsAt } → prisma.meeting.create + MeetingCreatedEvent
│   ├── queries/              # ListMeetingsQuery; GetMeetingByIdQuery — 404 if the meeting is missing
│   ├── events/               # MeetingCreatedEvent — handler currently just logs
│   └── dto/create-meeting.dto.ts  # class-validator: title (IsNotEmpty), startsAt (IsDateString)
└── meeting-file/       # → src/meeting-file/CLAUDE.md
test/
├── app.e2e-spec.ts
├── auth.e2e-spec.ts            # register/login
├── meeting.e2e-spec.ts         # meeting CRUD behind a Bearer token
├── meeting-files.e2e-spec.ts   # → src/meeting-file/CLAUDE.md
├── profile.e2e-spec.ts         # → src/profile/CLAUDE.md
└── profile-avatar.e2e-spec.ts  # → src/profile/CLAUDE.md
```

## Rules (`.claude/rules/`)

Detailed cross-cutting rules are split into focused files (not auto-loaded — read them via the link):

- [`esm.md`](../../.claude/rules/esm.md) — pure ESM, `.js` in imports
- [`cqrs.md`](../../.claude/rules/cqrs.md) — module layout, bus, events
- [`prisma.md`](../../.claude/rules/prisma.md) — Prisma 7, schema, migrations, access
- [`auth.md`](../../.claude/rules/auth.md) — JWT guard, protecting endpoints, `auth`↔`users` boundaries
- [`file-upload.md`](../../.claude/rules/file-upload.md) — multer, failure order, serving files
- [`testing.md`](../../.claude/rules/testing.md) — vitest, e2e, stubs, swapping env
- [`env.md`](../../.claude/rules/env.md) — a new variable = 3 places

## Conventions

Here — cross-cutting rules only. A specific module's behaviour lives in its `src/<module>/CLAUDE.md`.

- **ESM** — pure ESM (`"type": "module"`, `nodenext`); relative imports carry the `.js` extension even for `.ts`. Rules and checklist: [`.claude/rules/esm.md`](../../.claude/rules/esm.md).
- Standard Nest architecture: module → controller → service; DI via the constructor.
- Every service method: explicit TS types for all parameters and the return value (`Promise<T>`); no `console.log` — `Logger` from `@nestjs/common`; name variables meaningfully, not `x` / `data` / `result`.
- New resource — `pnpm exec nest g resource <name>` (schematics in `nest-cli.json`, `sourceRoot: src`).
- Shared library — `pnpm exec nest g library <name>`; path aliases from `tsconfig.json` are resolved in tests via `vite-tsconfig-paths`.
- `strict: true`, but `strictPropertyInitialization: false` (for DI and decorators).
- Tests (vitest, `*.spec.ts` / `test/*.e2e-spec.ts`, `globals: true`, e2e via `Test.createTestingModule`, `.overrideProvider`, swapping env before the dynamic import) — [`.claude/rules/testing.md`](../../.claude/rules/testing.md).
- Environment — variables from `.env` (template `.env.example`), read only through `ConfigService`, not `process.env`. A new variable = 3 places: [`.claude/rules/env.md`](../../.claude/rules/env.md).
- CORS is enabled globally in `main.ts` (`app.enableCors()`, all origins) — so `apps/web` (port 3000) can reach the API from the browser.
- Build config for the bundle — `tsconfig.build.json`, output to `dist/` (`deleteOutDir: true`).
- DTO validation — the global `ValidationPipe` (`class-validator`/`class-transformer`), wired via `APP_PIPE` in `AppModule` — active both in the real app and in e2e tests that boot `AppModule` directly through `Test.createTestingModule`.
- Authentication — JWT bearer, passwords `bcryptjs`, `@nestjs/jwt`. Protecting an endpoint (`imports: [AuthModule]` → `@UseGuards(JwtAuthGuard)` → `request.user.userId`), a public controller, `auth`↔`users` boundaries: [`.claude/rules/auth.md`](../../.claude/rules/auth.md).
- One `CqrsModule.forRoot()` per app (in `AuthModule`, `global: true`). The other CQRS modules (`meeting`, `meeting-file`, `users`, `profile`) only register their handlers in `providers` — the `explorer` from `@nestjs/cqrs` finds them across the whole app; a second `forRoot()` is not needed.
- Prisma — all rules (Prisma 7, driver adapter `@prisma/adapter-pg`, `url` only in `prisma.config.ts`, access only from CQRS handlers) in [`.claude/rules/prisma.md`](../../.claude/rules/prisma.md).
- **CQRS** (`@nestjs/cqrs`) — the pattern for modules with business logic (`auth`, `users`, `meeting`, `meeting-file`, `profile`): controller with no logic, reads through the `QueryBus`, side effects through the `EventBus`, layout `commands|queries|events/{impl,handlers}` + a barrel `index.ts`. Full rules: [`.claude/rules/cqrs.md`](../../.claude/rules/cqrs.md).
- **`auth`/`users` module boundaries** — `auth` never touches Prisma `User` directly, only via `users` commands/queries; `users` knows nothing about passwords/JWT (it takes a ready `passwordHash`). Neither imports the other — they talk over the CQRS bus. More — [`.claude/rules/auth.md`](../../.claude/rules/auth.md).
- **File storage (`storage`)** — `FileStorageService` (`src/storage/`), the single point of filesystem access for any uploaded binary: `save` / `exists` / `createReadStream` / `remove` over `${UPLOADS_DIR}/${storageKey}`, the directory is created in `onModuleInit`. Provided via `StorageModule` (imported by `meeting-file` and `profile`) — do not re-provide the service, do not touch `fs` in handlers. Upload rules (multer, failure order 401→413/400→404, write after validation, serving): [`.claude/rules/file-upload.md`](../../.claude/rules/file-upload.md).
- **A new module with non-trivial logic** → create `src/<module>/CLAUDE.md` (module structure + its rules), and leave only a row in the "Modules" table with a link in this file.

## Keeping the docs in sync

Change `api` architecture — update the docs in the same change:

- a new top-level module or a change to `src/` structure → the "Modules" table and the "Structure" section here; if the module has non-trivial logic — create `src/<module>/CLAUDE.md` and keep it there;
- the behaviour of a module that has its own `CLAUDE.md` changed → edit that file, not this one;
- new rules for ESM, DI, configuration, tests, authentication, file upload → the matching file in `.claude/rules/` (and a row in the "Rules" list if the file is new); small rules with no file of their own → the "Conventions" section;
- new/renamed scripts or a port → the "Commands" table (and the root `CLAUDE.md` if the shared pipeline is affected);
- new env variables → `.env.example` and the "Conventions" section.
