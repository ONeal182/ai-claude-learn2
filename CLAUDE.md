# CLAUDE.md

Monorepo — pnpm workspaces + Turborepo. Node >= 24, pnpm 11 (`corepack enable`).
Written in **English**; keep it that way.

## Token economy

- Never read or grep wholesale: `node_modules/`, `apps/web/.next/`, `apps/api/dist/`, `.turbo/`, `pnpm-lock.yaml`, `*.log`. For DB shape read `apps/api/prisma/schema.prisma`, not the generated client or migration SQL.
- Scope searches to `apps/api/src` / `apps/web/src`; reach skill data (`.agents/skills/**/data/`) through the skill, not raw reads.
- API is CQRS — go straight to `apps/api/src/<domain>/` (`commands/handlers`, `queries/handlers`, `dto`, `events`) instead of grepping; check the package `CLAUDE.md` first.
- Keep command output terse, widen only when debugging a specific failure:
  - `git log --oneline -n 20`, `git diff --stat` (then `--unified=0 -- <path>`), `git show --stat`
  - `gh` with `--json <fields>`, never the paginated tables
  - `pnpm --filter api test -- --reporter=dot`; `pnpm typecheck 2>&1 | tail -n 20`
  - anything noisy: `--quiet` / `--silent`, or pipe through `head` / `tail`

## Rules

- pnpm only (version in `package.json` → `packageManager`); never npm / yarn.
- Before committing: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`. The `.husky/pre-commit` hook runs `lint` always and `test` + `test:e2e` unless the commit is docs/config only (`*.md`, `.claude/**`, `.agents/**`, `docs/**`, `plan/**`); it never runs `typecheck`. `test:e2e` needs Postgres up (`docker compose up -d postgres`).
- Prettier runs after every `Write` / `Edit` via a `PostToolUse` hook — don't run `pnpm format` yourself.
- Change the architecture → update the affected docs in the same PR (a stale `CLAUDE.md` is a bug): Structure table + a package `CLAUDE.md` for new packages; a module with non-trivial logic gets its own `src/<module>/CLAUDE.md`; a cross-cutting convention goes in `.claude/rules/*.md` (not auto-loaded — link it from the package `CLAUDE.md`); command / port / stack tables here and in `README.md`; `.env.example` for env vars.
- Conventional Commits (`type(scope): summary`); branches `feature/<slug>`.

## Structure

| Package      | Stack                                                        | Dev port |
| ------------ | ---------------------------------------------------------- | -------- |
| `apps/web`   | Next.js 16 (App Router, React 19, TS, Tailwind v4, HeroUI v3) | 3000     |
| `apps/api`   | NestJS 12 (TS, ESM, oxlint, vitest)                         | 3001     |
| `packages/*` | Shared libraries (`@repo/*`), empty for now                | —        |

Each app has its own `CLAUDE.md`. `docs/` holds PRDs + research, `plan/` holds phase plans. Workspaces: `pnpm-workspace.yaml`; task pipeline: `turbo.json`.

## Commands

Scripts are in [`package.json`](package.json) (`pnpm <script>`; `pnpm web|api <script>` = `pnpm --filter …`). Not obvious there: `pnpm typecheck` runs `next typegen` first in `web`.

## Setup

- Postgres: `docker compose up -d postgres` (`docker-compose.yml`; details in `README.md`).
- Env: copy the three `.env.example` files (root, `apps/api`, `apps/web`) — self-documenting.

## CI

`.github/workflows/ci.yml` — on push to `main` and every PR: the local checks plus `prisma generate` / `prisma migrate deploy`, on Postgres.

## Shared code

Reusable logic → `packages/*` as `@repo/<name>`, wired via `workspace:*`.
