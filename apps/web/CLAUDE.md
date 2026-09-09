# CLAUDE.md — apps/web

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, HeroUI v3. Dev port **3000**.

## Commands

Run via root (`pnpm web <script>`) or from this directory:

| Command          | Action                                                 |
| ---------------- | ------------------------------------------------------ |
| `pnpm dev`       | `next dev` (watch, port 3000)                          |
| `pnpm build`     | `next build`                                           |
| `pnpm start`     | `next start` (after build)                             |
| `pnpm lint`      | ESLint                                                 |
| `pnpm typecheck` | `next typegen && tsc --noEmit` (generates route types) |

## Structure

```
src/
├── app/                   # App Router pages
│   ├── layout.tsx         # Root layout + dark mode script
│   ├── page.tsx           # / - protected dashboard
│   ├── register/page.tsx  # /register - registration
│   ├── login/page.tsx     # /login - authentication
│   ├── profile/           # /profile - user profile
│   │   ├── page.tsx       # View mode
│   │   └── edit/page.tsx  # Edit mode (name, avatar, password)
│   ├── meetings/[id]/page.tsx  # /meetings/:id - meeting details
│   └── globals.css        # Global styles + Tailwind + HeroUI
├── components/            # Reusable React components (client-side)
├── hooks/                 # Client-side React hooks
│   └── use-authed-resource.ts  # Protected page pattern
└── lib/                   # Platform-independent logic
    ├── api.ts             # NestJS API client (auth, meetings, profile, files)
    └── session.ts         # localStorage session (accessToken + email)
```

## Conventions

- **App Router** with server components by default; `"use client"` only when necessary.
- Import alias: `@/*` → `./src/*` (see `tsconfig.json`).
- Layers: `app/` routes, `components/` client components, `hooks/` client hooks, `lib/` React-free logic.
- Styles: **Tailwind v4** via `@tailwindcss/postcss`, directives in `globals.css`. No separate `tailwind.config`.
- UI library: **HeroUI v3** (`@heroui/react` + `@heroui/styles` over Tailwind v4 and React Aria). No provider needed; `@import "@heroui/styles"` in `globals.css` **after** `@import "tailwindcss"`. Components use compound pattern (`Card.Header`), handlers are `onPress` not `onClick`. Interactive components wrapped in client components.
- Dark theme: `.dark` class on `<html>` (shared by Tailwind `dark:` and HeroUI v3 tokens). Tailwind variant overridden to class-based in `globals.css` (`@custom-variant dark`). Inline script in `layout.tsx` sets class via `prefers-color-scheme` before first render.
- Lint: flat-config `eslint.config.mjs` (`core-web-vitals` + `typescript` from `eslint-config-next`).
- Public env vars: prefix `NEXT_PUBLIC_*` (e.g., `NEXT_PUBLIC_API_URL`), available in browser.

## UI Change Verification (Required)

Any UI change (layout, styles, components, pages, `globals.css`, tokens, theme) is **incomplete** until both:

1. **Visual check via Playwright MCP** — Open running dev server (`http://localhost:3000` — always up, don't start it). Verify: light/dark theme, mobile/desktop width, interactive states (focus, validation errors, loading, hover/active), no console errors.
2. **Review via `ui-ux-pro-max` skill** — Check changes against accessibility, forms, typography/color, layout rules (contrast ≥ 4.5:1, touch targets, heading hierarchy, form semantics).

Passing `typecheck`/`lint`/`build` is necessary but **insufficient**.

## API Integration

Calls to NestJS service via `process.env.NEXT_PUBLIC_API_URL` (default `http://localhost:3001`). All HTTP wrapped in `src/lib/api.ts`:

**Auth**: `registerUser`, `loginUser` → `POST /auth/{register,login}` → `{ accessToken }`.

**Meetings**: `bearerRequest(path, token)` helper for authenticated calls. `getMeetings(token)` → `Meeting[]`, `getMeeting(id, token)` → `Meeting`. `ApiError` with `status === 404` means not found.

**Profile** (`/users/me`, all authenticated): `getMe(token)` → `Me { id, email, name, avatarUrl, createdAt }`. `avatarSrc(avatarUrl)` prepends API_URL to relative paths. Updates: `updateProfileName`, `changePassword`, `uploadAvatar` (multipart). Errors through `withFriendlyErrors` for friendly messages (400 validation, 401 auth, 413 size).

**Meeting files** (`/meetings/:id/files`, all authenticated): `getMeetingFiles(meetingId, token)` → `MeetingFile[]` (includes `summaryStatus` and `summary: { summary, decisions, actionItems }`). `uploadMeetingFile` via `XMLHttpRequest` for progress events. `downloadMeetingFile`, `deleteMeetingFile`, `reprocessMeetingFile`, `resummarizeMeetingFile` endpoints.

Error handling: `status === 0` → network error, `ApiError` with status/messages for API errors.

## Client Authentication

Session (`accessToken` + `email`) in `localStorage` via `src/lib/session.ts`. No token decoding on client.

**Protected page pattern**: `useAuthedResource(load)` hook handles: no session → redirect `/login`, call `load(accessToken)`, 401 response → clear session + redirect `/login`. Returns `{ status, data, error, session }`. Non-401 errors (including 404) handled by page.

**Pages**:

- `/` (Dashboard): loads meetings + profile for header. Logout clears session.
- `/profile` (ProfileView): loads profile, shows avatar/name/email/createdAt, edit link.
- `/profile/edit` (ProfileEdit): three independent forms (name, avatar with preview, password). Success redirects to `/profile`.
- `/meetings/[id]` (MeetingDetails): loads meeting. 404 shows "not found" state without redirect.

**MeetingFiles component**: receives `accessToken` as prop. Polls every 3s while files have `pending`/`processing` status (file or summary). 401 anywhere → clear session + redirect `/login`. Upload via drag-drop or picker. Delete requires confirmation dialog (irreversible). Summary section for recordings: shows progress spinner while processing, expandable summary/decisions/tasks when done, retry button if failed.

## Documentation Updates

Architecture changes require updating this file in the same commit:

- New top-level `src/` directory, routing changes, or layer changes → Structure section
- New import aliases, lint rules, style approach changes → Conventions section
- New/renamed scripts or port → Commands table (and root `CLAUDE.md` if affecting shared pipeline)
- New `NEXT_PUBLIC_*` variables → `.env.example` and API Integration section
