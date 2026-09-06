# File upload rules (apps/api)

Shared by `profile` (avatar) and `meeting-file`. Any new upload endpoint follows this.

## Wiring

- `FileInterceptor('<field>')` on the route + `MulterModule.registerAsync` in the module,
  **memoryStorage** (the handler gets a buffer, not a temp file):
  - `limits.fileSize` from `MAX_UPLOAD_SIZE_BYTES` (`ConfigService`) → exceed ⇒ **413**.
  - `fileFilter` against an explicit mime whitelist → reject ⇒ **400**.
    (`meeting-file`: `allowed-mime.ts`; `profile`: `AVATAR_MIME_TO_EXT`.)

## Failure order (do not reorder)

`JwtAuthGuard` (401) → multer `limits` / `fileFilter` (413 / 400) → command handler
(domain checks, e.g. `GetMeetingByIdQuery` → 404).

## Handler

- **Write to disk in the command handler, after domain validation** — never in the controller or
  interceptor. A 404 / 400 must leave no file on disk (no orphans).
- Filesystem access **only** through `FileStorageService` from `StorageModule` — never `fs` in a
  handler. Import `StorageModule`; don't re-provide the service.
- `storageKey` is generated server-side (`randomUUID`, or `<randomUUID>.<ext>` for avatars) — user
  input never enters the path, so there is no path traversal.
- On a post-write failure (e.g. the DB update throws), remove the file you just wrote.
- Replacing a file (avatar re-upload): write the new one, update the row, then `storage.remove` the
  previous key.

## Serving

- `StreamableFile` for downloads. `Content-Type` is recovered from the key's extension
  (`AVATAR_EXT_TO_MIME`) — mime is **not** stored in the DB for avatars.
- Attachment downloads set `Content-Disposition` per RFC 5987 (`filename*` UTF-8 + ASCII fallback,
  see `attachment-disposition.ts`).
- 404 when: extension not whitelisted, no row references the key, or the binary is missing on disk.

## Deliberate non-goals (this iteration)

Trust the client `Content-Type` (no content sniffing / AV); durability across restarts and
multi-instance shared storage are not handled.

## DB

Binary on disk, row in the DB holds metadata + `storageKey` only. `MeetingFile.status` is set by
the handler (no `@default`). See [`prisma.md`](prisma.md).
