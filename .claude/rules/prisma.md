# Prisma rules (apps/api)

**Prisma 7**, no-rust-engine — the client talks to Postgres through the driver adapter
`@prisma/adapter-pg`, not the bundled Rust engine.

## Schema & config

- Models live in `apps/api/prisma/schema.prisma`. Enums: `MeetingFileType` (`recording` | `attachment`),
  `MeetingFileStatus` (`pending` | `processing` | `done` | `failed`).
- **No `url` in the `datasource` block** — Prisma 7 forbids it. The connection URL is set only in
  `apps/api/prisma.config.ts` via `env('DATABASE_URL')`.
- Every model maps to a snake_case table with `@@map(...)`; keep `createdAt DateTime @default(now())`
  and `updatedAt DateTime @updatedAt` on new models; index foreign keys (`@@index([...])`).
- `MeetingFile.status` has **no `@default`** on purpose — `CreateMeetingFileHandler` sets it
  (`recording` → `pending`, `attachment` → `done`).
- `MeetingFile.meeting` is `onDelete: Cascade`.

## Access

- `PrismaService` (`src/prisma/prisma.service.ts`) extends `PrismaClient`, builds the `PrismaPg` adapter
  from `ConfigService.getOrThrow('DATABASE_URL')`, and does `$connect` / `$disconnect` on module lifecycle.
  It is provided `@Global` by `PrismaModule` — inject `PrismaService`, never `new PrismaClient()`.
- Prisma calls belong in CQRS command / query handlers only, not in controllers or in services outside a
  handler. Reads (even from inside a command handler) go through the `QueryBus` so each read model has one
  source of truth — see `apps/api/CLAUDE.md` → "Соглашения" / CQRS.
- Handle `P2025` (record not found) wherever a concurrent delete is possible — e.g. the meeting-file
  processing worker swallows it.

## Migrations & client

- Schema changed → `pnpm api exec prisma migrate dev --name <name>` (creates the migration, applies it,
  regenerates the client).
- Schema edited without `migrate dev` → `pnpm api exec prisma generate` (the generated client is required
  to typecheck / build).
- CI runs `prisma generate` then `prisma migrate deploy`; prod applies migrations with `migrate deploy`,
  never `migrate dev`.
- Migrations in `apps/api/prisma/migrations/` are immutable once merged — never edit an applied migration,
  add a new one.
- `pnpm api exec prisma studio` — DB GUI.

## Tests

- Unit tests stub Prisma. E2e (`pnpm test:e2e`) hits a real Postgres
  (`docker compose up -d postgres`) and applies migrations first.
