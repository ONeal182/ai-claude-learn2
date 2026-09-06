# CLAUDE.md

Monorepo — pnpm workspaces + Turborepo. Node >= 24, pnpm 11 (`corepack enable`).
This file is written in **English**; keep it that way.

### Keep command output small

Default to the terse form; widen only when you actually need the detail.

- `git log --oneline -n 20`, `git diff --stat` (then `git diff --unified=0 -- <path>` for one file), `git show --stat`.
- `gh` always with `--json <fields>` (e.g. `gh issue list --json number,title,state`, `gh pr view --json title,body,files`) — never the default paginated tables.
- Sweep tests with `pnpm --filter api test -- --reporter=dot`; switch to the full reporter only for a file that failed.
- `pnpm typecheck 2>&1 | tail -n 20`, `pnpm lint 2>&1 | tail -n 30` — the tail holds the errors.
- Any other noisy command: add `--quiet` / `--silent` / `--reporter=dot` or pipe through `head` / `tail`.

## Rules for the agent

- Package manager is **pnpm only** (version pinned in `package.json` → `packageManager`). Never use npm or yarn.
- Before committing, run `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`. The `.husky/pre-commit` hook runs all of these **except `typecheck`** on every `git commit`.
- `pnpm test:e2e` and every `git commit` need a running Postgres: `docker compose up -d postgres`.
- Prettier runs on every file after `Write` / `Edit` via a `PostToolUse` hook (`.claude/settings.json`).
- When you change the architecture, update the affected docs in the same PR — a stale `CLAUDE.md` is a bug: the Structure table + a package `CLAUDE.md` for new packages; the command / port / stack tables here and in `README.md`; `.env.example` for env vars.
- Commit messages follow Conventional Commits (`type(scope): summary`, e.g. `feat(api): …`); branch names are `feature/<slug>`.

## Structure

| Package      | Stack                                                        | Dev port |
| ------------ | ---------------------------------------------------------- | -------- |
| `apps/web`   | Next.js 16 (App Router, React 19, TS, Tailwind v4, HeroUI v3) | 3000     |
| `apps/api`   | NestJS 12 (TS, ESM, oxlint, vitest)                         | 3001     |
| `packages/*` | Shared libraries (`@repo/*`), empty for now                | —        |

Each app has its own `CLAUDE.md`. Workspaces: `pnpm-workspace.yaml`. Task pipeline: `turbo.json`.

Feature docs: `docs/` holds PRDs and research notes, `plan/` holds phase-by-phase implementation plans (one file per feature). Node version is pinned in `.node-version` / `.nvmrc`.

## Commands

Run scripts with `pnpm <script>` — the list is in [`package.json`](package.json). `pnpm web <script>` / `pnpm api <script>` proxy to `pnpm --filter web|api`. Not visible there: `pnpm typecheck` runs `next typegen` first in `web`.

## Setup

- Postgres: `docker compose up -d postgres` (config in `docker-compose.yml`; details in `README.md`).
- Env: copy `.env.example`, `apps/api/.env.example` and `apps/web/.env.example` to `.env` — the examples are self-documenting.

## CI

`.github/workflows/ci.yml` runs on push to `main` and on every pull request: the same checks as local plus `prisma generate` and `prisma migrate deploy`, on a Postgres service.

## Shared code

Extract reusable logic into `packages/*` as `@repo/<name>` and wire it via `workspace:*`.

## Token economy

- **Never read or grep wholesale:** `node_modules/` (~2 GB), `apps/web/.next/` (~350 MB), `apps/api/dist/`, `.turbo/`, `pnpm-lock.yaml` (~300 KB), `ralph.log` / `*.log`. The Prisma client is generated — read `apps/api/prisma/schema.prisma` (the source, one small file), not client output, and don't reconstruct models from `apps/api/prisma/migrations/` SQL.
- **Scope every search** to `apps/api/src` or `apps/web/src` (both small), not the repo root. Skill data under `.agents/skills/**/data/` holds multi-hundred-KB catalogs — reach it through the skill, never a raw read.
- **API is CQRS:** each domain is `apps/api/src/<domain>/` with `commands/handlers`, `queries/handlers`, `dto`, `events`. Jump straight to the domain folder instead of grepping.
- **Read the package `CLAUDE.md`** (`apps/api`, `apps/web`) before exploring that app — it usually already answers the question.
- **Don't repeat automation:** Prettier runs via the `PostToolUse` hook, so never run `pnpm format` after an edit; the `pre-commit` hook already runs lint / test / e2e.
- Prefer `Grep` / `Glob` with a path filter and targeted line-range `Read`s over `cat`, `find` from root, or reading whole files.

These forms drop context lines and error tails, so run the full command when you are debugging a specific failure.
