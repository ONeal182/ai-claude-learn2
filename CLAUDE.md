# CLAUDE.md

Monorepo on **pnpm workspaces** + **Turborepo**. Node >= 24, pnpm 11 (`corepack enable`).

## Structure

| Package      | Stack                    | Port (dev) | Documentation        |
| ------------ | ------------------------ | ---------- | -------------------- |
| `apps/web`   | Next.js 16, React 19, TS | 3000       | `apps/web/CLAUDE.md` |
| `apps/api`   | NestJS 12, TS, ESM       | 3001       | `apps/api/CLAUDE.md` |
| `packages/*` | Shared libraries, empty  | —          | —                    |

Workspaces declared in `pnpm-workspace.yaml` (`apps/*`, `packages/*`). Task pipeline in `turbo.json`.

## Commands (from root)

| Command             | Action                                             |
| ------------------- | -------------------------------------------------- |
| `pnpm install`      | Install all workspace dependencies                 |
| `pnpm dev`          | Start `web` + `api` in watch mode (parallel)       |
| `pnpm build`        | Production build all packages (`turbo run build`)  |
| `pnpm start`        | Build + start all packages                         |
| `pnpm lint`         | Lint all packages (ESLint for web, oxlint for api) |
| `pnpm typecheck`    | `tsc --noEmit` all packages                        |
| `pnpm test`         | Run tests all packages (vitest in api)             |
| `pnpm test:e2e`     | E2E tests (requires Postgres running)              |
| `pnpm format`       | Format all files with Prettier                     |
| `pnpm format:check` | Check formatting without changes                   |

### Single package

```bash
pnpm web <script>    # = pnpm --filter web <script>
pnpm api <script>    # = pnpm --filter api <script>
```

## Conventions

- Package manager: **pnpm only** (version pinned in `package.json` → `packageManager`). No npm/yarn.
- Turbo caches `build`, `lint`, `typecheck`, `test`; `dev`/`start` are `persistent`, no cache.
- pnpm blocks postinstall scripts; allowed builds listed in `pnpm-workspace.yaml` → `allowBuilds`.
- Formatting: Prettier (`.prettierrc.json`), indent style in `.editorconfig`. `PostToolUse` hook in `.claude/settings.json` auto-runs Prettier after `Write`/`Edit`.
- Pre-commit: `pnpm lint && pnpm typecheck && pnpm test`.
- Husky hook `.husky/pre-commit` runs `pnpm lint && pnpm test && pnpm test:e2e` on `git commit`. E2E requires Postgres (`docker compose up -d postgres`) — commits fail without it.
- CI: `.github/workflows/ci.yml` runs on push/PR to `main`: starts Postgres, installs deps, generates Prisma Client, runs `lint`, `typecheck`, `test`, `prisma migrate deploy`, `test:e2e`, `build`.

## Database

Postgres via `docker-compose.yml` (image `postgres:17-alpine`, port `5432`, volume `postgres-data`).

```bash
cp .env.example .env          # POSTGRES_* and DATABASE_URL
docker compose up -d postgres # start
pnpm api seed                 # populate with test data (optional)
docker compose down           # stop (volume persists)
docker compose down -v        # stop and delete data
```

`pnpm api seed` creates: user `test@example.com` / `test123456`, 3 meetings with recording files, 5 tasks.

## Environment Variables

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

By default `apps/api` uses `STT_ENGINE=whisper` (local meeting transcription). Requires `whisper.cpp` + `ffmpeg` and model: `pnpm --filter api whisper:model`. Without engine, set `STT_ENGINE=stub` in `apps/api/.env`. Details in `apps/api/src/meeting-file/CLAUDE.md`.

## Shared Code

Extract reusable logic to `packages/*` as `@repo/<name>` and reference via `workspace:*`.

## Documentation Updates

When changing project architecture, update documentation **in the same commit**:

- New package/app in `apps/*` or `packages/*` → row in Structure table here + own `CLAUDE.md` in package directory
- Changed scripts, ports, stack, `turbo.json` pipeline, or workspaces → corresponding tables in this file and `README.md`
- New/renamed env variables → package `.env.example` and Environment Variables section
- Changed conventions (folder structure, import aliases, lint/build rules) → Conventions section in root and/or package `CLAUDE.md`

Documentation and code updated in one PR — `CLAUDE.md` diverging from reality is a bug.

## graphify

This project has a knowledge graph at `graphify-out/` with god nodes, community structure, and cross-file relationships.

Rules:

- For codebase questions, first run `graphify query "<question>"` when `graphify-out/graph.json` exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than `GRAPH_REPORT.md` or raw grep output.
- If `graphify-out/wiki/index.md` exists, use it for broad navigation instead of raw source browsing.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
