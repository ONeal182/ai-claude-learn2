# CLAUDE.md — apps/web

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, HeroUI v3. Dev port **3000**.

## Commands

Run from the root (`pnpm web <script>`) or from this folder:

| Command          | Action                                                             |
| ---------------- | ----------------------------------------------------------------- |
| `pnpm dev`       | `next dev` (watch, port 3000)                                      |
| `pnpm build`     | `next build`                                                       |
| `pnpm start`     | `next start` (after `build`)                                       |
| `pnpm lint`      | `eslint` (flat config `eslint.config.mjs`)                         |
| `pnpm typecheck` | `next typegen && tsc --noEmit` (typegen generates route types)     |

## Rules (`.claude/rules/`)

Detailed cross-cutting rules — in focused files (not auto-loaded, read them via the link):

- [`code-style.md`](../../.claude/rules/code-style.md) — naming, file/method size, enums over literals, constants over magic numbers, dependency hygiene
- [`heroui.md`](../../.claude/rules/heroui.md) — HeroUI v3: `onPress`, compound components, `@import` order, client wrappers
- [`dark-theme.md`](../../.claude/rules/dark-theme.md) — `.dark` on `<html>`, `@custom-variant dark`, pre-paint script, 4.5:1 contrast
- [`web-api-client.md`](../../.claude/rules/web-api-client.md) — `src/lib/api.ts`, `bearerRequest`, `ApiError.status`, upload via `XMLHttpRequest`, polling
- [`client-auth.md`](../../.claude/rules/client-auth.md) — session in `localStorage`, `useAuthedResource(load)`, `401 → clearSession`

## Structure

```
src/
├── app/                # App Router (routes are server components)
│   ├── layout.tsx      # root layout + theme script (see dark-theme.md)
│   ├── page.tsx        # / — protected home, renders <Dashboard />
│   ├── register/page.tsx  # /register
│   ├── login/page.tsx     # /login, on success → /
│   ├── meetings/[id]/page.tsx # meeting details + "Files" block; renders <MeetingDetails id={id} />
│   └── globals.css     # Tailwind + HeroUI + theme tokens
├── components/         # client (`"use client"`) React components on HeroUI
│   │                   # register-form, login-form, dashboard, meeting-details, meeting-files, icons
├── hooks/
│   └── use-authed-resource.ts # protected-page flow (see client-auth.md)
└── lib/                # non-React logic
    ├── api.ts          # NestJS API client (see web-api-client.md)
    └── session.ts      # session in localStorage
public/                 # static assets
```

## Conventions

- **App Router**, server components by default; `"use client"` — only when the client is needed.
- Code style — naming, file/method size, enums over string literals, named constants over magic numbers, no circular deps: [`.claude/rules/code-style.md`](../../.claude/rules/code-style.md).
- Import alias: `@/*` → `./src/*` (`tsconfig.json`).
- Layers: `app/` — routes, `components/` — client components, `hooks/` — client hooks (`"use client"`), `lib/` — non-React logic.
- Styling — Tailwind v4 via `@tailwindcss/postcss` (`postcss.config.mjs`), directives in `src/app/globals.css`; there is no separate `tailwind.config`. HeroUI v3 — see [`heroui.md`](../../.claude/rules/heroui.md).
- Dark theme, contrast — see [`dark-theme.md`](../../.claude/rules/dark-theme.md).
- Public env vars — prefixed `NEXT_PUBLIC_` (`NEXT_PUBLIC_API_URL` in `.env.example`); see [`.claude/rules/env.md`](../../.claude/rules/env.md).
- Framework config — `next.config.ts`.

## Verifying UI changes (mandatory)

Any change that touches the interface (layout, styles, components, pages,
`globals.css`, tokens, theme) is **not done** until both of these are complete:

1. **Visual check via Playwright MCP** — with that tool only, not "by eye"
   from the code and not with screenshots from another source. Open the running dev server
   (`http://localhost:3000` — the server is always up, do not start it yourself) and check:
   light and dark theme, mobile and desktop width, interactive states
   (focus, validation errors, loading, hover/active), no console errors.
2. **Review via the `ui-ux-pro-max` skill** — run the change through its data
   (search the relevant domains: accessibility, forms, typography/color, layout, etc.)
   and confirm the edits do not break its rules (contrast ≥ 4.5:1, touch targets,
   heading hierarchy, form semantics, and so on).

Passing `typecheck` / `lint` / `build` is necessary but **not sufficient**.

## API access and authentication

The API client is `src/lib/api.ts` (components never call `fetch` directly), rules in
[`web-api-client.md`](../../.claude/rules/web-api-client.md). Session and page protection are entirely
client-side (`localStorage` + `useAuthedResource`), rules in
[`client-auth.md`](../../.claude/rules/client-auth.md). API response shape and error codes — in
`apps/api/CLAUDE.md` and its per-module `CLAUDE.md` files.

## Keeping the docs in sync

Change `web` architecture — update the docs in the same change:

- a new top-level directory in `src/`, a change to the routing structure or layers → the "Structure" section;
- a new cross-cutting rule (styles, theme, API access, authentication) → the matching file in `.claude/rules/` (and a row in the "Rules" list if the file is new); small rules — the "Conventions" section;
- new/renamed scripts or a port → the "Commands" table (and the root `CLAUDE.md` if the shared pipeline is affected);
- new `NEXT_PUBLIC_*` variables → `.env.example` and [`.claude/rules/env.md`](../../.claude/rules/env.md).
