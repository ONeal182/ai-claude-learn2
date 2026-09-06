# CLAUDE.md — apps/api/src/meeting-file

CQRS module. Nested resource `/meetings/:meetingId/files`, controller under `@UseGuards(JwtAuthGuard)` (imports `AuthModule`). Binaries live on disk in `UPLOADS_DIR` (flat, name = random uuid = `storageKey`); the DB table `meeting_files` holds only metadata + `storageKey`.

## Layout

```
meeting-file/
├── meeting-file.module.ts     # imports: [AuthModule, StorageModule, MulterModule.registerAsync]
│                              #   — limits.fileSize from MAX_UPLOAD_SIZE_BYTES (→413), fileFilter by allowed-mime (→400)
├── meeting-file.controller.ts # POST /  ·  GET /  ·  GET /:fileId/content (StreamableFile)
│                              #   ·  POST /:fileId/reprocess (200)  ·  DELETE /:fileId
├── allowed-mime.ts            # ALLOWED_UPLOAD_MIME_TYPES — mime whitelist (shared for recording/attachment)
├── attachment-disposition.ts  # attachmentDisposition(name) — Content-Disposition: filename* (UTF-8) + ASCII fallback
├── processing/
│   ├── stt.service.ts         # STT_SERVICE token + StubSttService — the only deterministic stub
│   │                          #   (transcript from metadata, no branching); STT error path in e2e via .overrideProvider
│   └── meeting-file-processing.queue.ts  # in-process worker (concurrency 1): pending→processing→done|failed + transcriptText
│                              #   OnModuleDestroy stops the queue (else e2e app.close() keeps burning); P2025 on DELETE — silent
├── commands/
│   ├── impl/                  # CreateMeetingFileCommand { meetingId, type, file }
│   │                          #   DeleteMeetingFileCommand / ReprocessMeetingFileCommand { meetingId, fileId }
│   └── handlers/              # CreateMeetingFileHandler — 404 via QueryBus(GetMeetingByIdQuery), write file + prisma.meetingFile.create,
│                              #   for recording publish MeetingFileProcessingRequestedEvent
│                              # DeleteMeetingFileHandler — 404 via QueryBus(GetMeetingFileQuery), delete (transcript = same row) + storage.remove
│                              # ReprocessMeetingFileHandler — atomic updateMany failed→pending (count 0 → 409), publish event
├── queries/
│   ├── impl/                  # ListMeetingFilesQuery { meetingId }, GetMeetingFileQuery / GetMeetingFileContentQuery { meetingId, fileId }
│   └── handlers/              # ListMeetingFilesHandler; GetMeetingFileHandler — the only read of a single MeetingFile row (404);
│                              #   GetMeetingFileContentHandler — { stream, mimeType, originalName }, 404 also if the binary is gone from disk
├── events/
│   ├── impl/                  # MeetingFileProcessingRequestedEvent { fileId } — "this file needs background processing"
│   └── handlers/              # MeetingFileProcessingRequestedHandler — unconditionally enqueues into MeetingFileProcessingQueue
└── dto/
    ├── upload-meeting-file.dto.ts  # class-validator: type ∈ Object.values(MeetingFileType)
    ├── uploaded-file-part.ts       # local multipart-part type (no @types/multer)
    ├── meeting-file-content.ts     # response body for GET :fileId/content (stream + headers)
    └── meeting-file.dto.ts         # response shape (no storageKey) + toMeetingFileDto(prisma → dto)
```

## Notes

- **Upload.** Follows [`.claude/rules/file-upload.md`](../../../../.claude/rules/file-upload.md). Module specifics: field `file`; mime whitelist in `allowed-mime.ts` (shared for `recording` / `attachment`); the disk write happens in `CreateMeetingFileHandler` *after* `GetMeetingByIdQuery` (404) so a rejected upload leaves no orphan. A non-ASCII multipart filename is re-decoded `latin1 → utf8` in the controller; downloads use `attachment-disposition.ts`.
- **Deliberate limits of this iteration:** deleting a meeting (`onDelete: Cascade`) would orphan binaries on disk (meeting deletion is out of scope); queue / file durability across restart is not guaranteed; with multiple API instances the directory is not shared.
- **Background processing (`processing/`).** Both entry points go through one event `MeetingFileProcessingRequestedEvent { fileId }`: `CreateMeetingFileHandler` publishes it for a freshly uploaded `recording` (the "does it need processing?" decision lives with the publisher), `ReprocessMeetingFileHandler` after a successful status reset. `MeetingFileProcessingRequestedHandler` unconditionally enqueues `fileId` into `MeetingFileProcessingQueue` — an in-process worker, no external broker (`concurrency = 1`), runs `pending → processing → done|failed` and on success writes `transcriptText` into the same row. `SttService` (token `STT_SERVICE`) has one implementation `StubSttService`: the transcript is derived deterministically from file metadata (no content read, no `NODE_ENV` branching — local pre-commit runs with `development`). The STT error path in e2e is set via `.overrideProvider(STT_SERVICE)` (the double fails on a `__stt_fail__` marker in the name) — no test branches in prod. `POST .../reprocess` is an atomic `updateMany({ where: { status: failed }, data: { status: pending, transcriptText: null } })`; `count === 0` → `409 Conflict` (a race / wrong status never double-enqueues), otherwise the event is published. `DELETE` removes the transcript with the row; if the file is being processed at that moment the worker catches `P2025` and stops silently. `MeetingFileProcessingQueue` implements `OnModuleDestroy` (stop flag + `await` the current task) — otherwise e2e with `app.close()` in `afterEach` keeps running and writes to a closed `PrismaClient`. Durability across restarts is not guaranteed: stuck `pending` / `processing` are not resumed.
- **E2e and files on disk.** `test/meeting-files.e2e-spec.ts` in `beforeAll` swaps `process.env.UPLOADS_DIR` for a temp dir (`os.tmpdir()`) and removes it in `afterAll`, and sets `MAX_UPLOAD_SIZE_BYTES` small — to check 413 cheaply and not litter the real `uploads/`. `@nestjs/config` does not overwrite already-set `process.env`, so the swap is done before importing `AppModule` (dynamic `import()` in `beforeEach`). Covers: upload / list / download / delete; failures 401 / 413 / 400 / 404; background processing of a recording (pending→done + transcript); reprocess (200 only for `failed`, else 409); the full UI path in one run.
