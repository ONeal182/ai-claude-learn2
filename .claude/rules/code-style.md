# Code style rules (apps/*)

Language and structure hygiene shared by `apps/api` and `apps/web`. Framework-specific rules
live in the other `.claude/rules/*` files; this one is about naming, size, and dependencies.

## Naming

- **Files**: `feature.type.ts` — `meetings.service.ts`, `meeting.controller.ts`,
  `use-authed-resource.ts`. Tests: `*.spec.ts` (unit) / `*.e2e-spec.ts` (e2e).
- **A method name states an action**: `createMeetingWithFiles`, not `meetingFiles`.
- **Variables carry meaning**: `meetingId`, not `id` / `x` / `data` / `result`.
- **Enum, not string literals**: `MeetingFileStatus.pending`, not `'pending'` / `'pnd'`
  (enums `MeetingFileType`, `MeetingFileStatus` live in `schema.prisma`).
- **Named constant, not a magic number**: `MAX_UPLOAD_SIZE_BYTES`, `POLL_INTERVAL_MS` — never a
  bare `5242880` / `3000` in the body.

## Size

- **File > 200 lines** → split it before adding more code.
- **Method > 30 lines** → extract a private method.
- **Nesting > 3 levels** → refactor (early return, extract a function, invert the condition).

## Types & logging (apps/api)

- Every service method has explicit TS types for **all parameters** and the **return value**
  (`Promise<T>` for async) — no implicit `any`.
- No `console.log` — use `Logger` from `@nestjs/common`.

## Dependencies

- Import a module, not another module's service/provider directly. In `apps/api` cross-module
  calls go over the CQRS bus only — see [`cqrs.md`](cqrs.md).
- **No circular dependencies** — check before committing (Nest logs a `Circular dependency`
  warning at bootstrap; otherwise trace the import chain). Break the cycle, don't hide it behind
  `forwardRef`.
- Shared types belong in a `@repo/*` workspace package (root `CLAUDE.md` → "Shared code"), not
  copied between apps.

## Refactoring

- Adding code to an oversized file/method → decompose first, then add.
- Tests stay green at every refactor step — see [`testing.md`](testing.md).
