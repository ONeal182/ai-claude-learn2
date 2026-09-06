# Client auth rules (apps/web)

Protection is **entirely client-side** — no middleware, no cookies. Consistent with keeping the
token in `localStorage`.

## Session

- `src/lib/session.ts`: `saveSession` / `getSession` / `clearSession` store `{ accessToken, email }`
  in `localStorage`. The JWT is **not** decoded on the client.
- `LoginForm` / `RegisterForm` call `saveSession` right after a successful `loginUser` /
  `registerUser`. Login also `router.push('/')`.

## `useAuthedResource(load)` — `src/hooks/use-authed-resource.ts`

The standard protected-page flow:

- On mount reads `getSession()`; if none → `router.replace('/login')`.
- Calls `load(accessToken)`. A `401` response → `clearSession()` + `/login`.
- Returns `{ status: 'loading' | 'ready' | 'error', data, error, session }`. Other errors
  (including `ApiError.status === 404`) stay in `error` for the page to render itself.
- **`load` must be stable** — a module-level function or `useCallback`.

Usage: `Dashboard` loads `GET /meetings`; `MeetingDetails` loads `getMeeting(id)` and renders a
"not found" state on `ApiError.status === 404` (no redirect).

## Nested widgets

A widget rendered once `useAuthedResource` has produced `session` (e.g. `MeetingFiles`) takes
`accessToken` as a prop and does **not** call `useAuthedResource` again; it handles its own `401`
via the pattern in [`web-api-client.md`](web-api-client.md) ("Polling").

"Выйти" = `clearSession()` + `router.replace('/login')`.
