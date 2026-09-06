# Environment variable rules

A new or renamed env var touches **three** places — miss one and it silently breaks:

1. **`<pkg>/.env.example`** — add the key with a short comment and a safe default
   (root `.env.example` for Postgres / `DATABASE_URL`; `apps/api/.env.example`; `apps/web/.env.example`).
2. **`turbo.json` → `globalPassThroughEnv`** — add the key, or Turbo hashes tasks without it and
   `dev` / `build` see a stale cached result. (Currently: `DATABASE_URL`, `JWT_SECRET`,
   `JWT_EXPIRES_IN`, `NODE_ENV`, `PORT`, `UPLOADS_DIR`, `MAX_UPLOAD_SIZE_BYTES`.)
3. **Docs** — the env section in the package `CLAUDE.md` (and `apps/api/CLAUDE.md` → "Соглашения"
   lists the api vars).

CI (`.github/workflows/ci.yml`) sets its own `env:` block — add the key there too if a test needs it.

## Reading

- **api**: only through `ConfigService` (`ConfigModule.forRoot({ isGlobal: true })` in `AppModule`),
  never `process.env` directly. Required → `configService.getOrThrow<string>('KEY')`; optional →
  `configService.get('KEY', 'default')`.
- **web**: browser-exposed vars must be prefixed `NEXT_PUBLIC_` (e.g. `NEXT_PUBLIC_API_URL`); read
  as `process.env.NEXT_PUBLIC_*`.
- `prisma.config.ts` reads `env('DATABASE_URL')` after its first-line `import 'dotenv/config'`.

## Current vars

| Var | Where | Notes |
| --- | ----- | ----- |
| `POSTGRES_USER` / `_PASSWORD` / `_DB` / `_PORT` | root `.env` | docker-compose only |
| `DATABASE_URL` | root + `apps/api` | `postgresql://app:app@localhost:5432/app` |
| `PORT` | `apps/api` | API port, default 3001 |
| `NODE_ENV` | `apps/api` | |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | `apps/api` | HS256 secret / TTL (default `1d`) |
| `UPLOADS_DIR` | `apps/api` | flat binary store, relative to cwd or absolute |
| `MAX_UPLOAD_SIZE_BYTES` | `apps/api` | per-file cap; exceeded → 413 (default 5 MiB) |
| `NEXT_PUBLIC_API_URL` | `apps/web` | API base URL for the browser |
