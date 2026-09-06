# Web API client rules (apps/web)

All HTTP to the NestJS service goes through **`src/lib/api.ts`** — client components never call
`fetch` directly. Base URL: `process.env.NEXT_PUBLIC_API_URL` (default `http://localhost:3001`;
the API sends CORS `*`).

## Helpers

- `bearerRequest(path, token, method = 'GET')` — `fetch` with `Authorization: Bearer <token>`.
  Used by `getMeetings`, `getMeeting`, `getMeetingFiles`, `deleteMeetingFile`,
  `reprocessMeetingFile`.
- `registerUser` / `loginUser` → `POST /auth/register` | `/auth/login`, return `{ accessToken }`.
- Response parsing is shared: `networkError()` (`status === 0` → offline) and
  `readBodyOrThrow(response)` (empty body → `undefined`; non-`ok` → `ApiError` via
  `messagesFromBody`).
- **`ApiError`** carries `status`. Callers branch on it: `404` → not found, `409` → conflict
  (e.g. `reprocess` of a non-`failed` file), `401` → auth (see [`client-auth.md`](client-auth.md)).

## Uploads & downloads

- `uploadMeetingFile({ meetingId, file, type, accessToken, onProgress })` uses **`XMLHttpRequest`**
  (needs `upload.onprogress`), not `fetch`. `413` / `400` / `0` are mapped to human text **in the
  component**, not the client.
- The `recording` | `attachment` choice is made by the **component** (`detectFileType`: mime
  `audio/*` / `video/*`, or by extension when mime is empty) with a manual override — not by the
  API client.
- `downloadMeetingFile(...)` is behind the guard, so it fetches with the bearer header and returns
  `{ blob, filename }` (name from `Content-Disposition`); the component saves it via a hidden
  `<a download>`.

## Polling

A list with any `pending` / `processing` item polls (`MeetingFiles`: `getMeetingFiles` every
`POLL_INTERVAL_MS` = 3 s) plus a manual "Обновить" button. On `ApiError.status === 401` anywhere,
call the auth-error handler: `clearSession()` + `router.replace('/login')` and set a `deadRef` so
in-flight / scheduled responses stop touching state. First load runs through `.then/.catch` in an
effect (no synchronous `setState` — `react-hooks/set-state-in-effect`).
