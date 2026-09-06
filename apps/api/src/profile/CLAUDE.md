# CLAUDE.md — apps/api/src/profile

CQRS module for the current user's profile and avatar. `ProfileController` is under `@UseGuards(JwtAuthGuard)`; `AvatarController` is public. Imports `AuthModule` (for the guard) and `StorageModule` (for the filesystem). Owns no Prisma models — every `User` read/write goes through the `users` module.

## Layout

```
profile/
├── profile.module.ts     # imports: [AuthModule, StorageModule, MulterModule.registerAsync]
│                          #   — limits.fileSize from MAX_UPLOAD_SIZE_BYTES (def. 5 MiB, →413), fileFilter by AVATAR_MIME_TO_EXT (→400)
├── profile.controller.ts # GET /users/me, PATCH /users/me, PUT /users/me/avatar (FileInterceptor('file')) — userId from request.user
├── avatar.controller.ts  # public (no JwtAuthGuard) GET /users/avatars/:key → StreamableFile, Content-Type from the key extension
├── avatar-mime.ts        # AVATAR_MIME_TO_EXT (image/jpeg→jpg, image/png→png, image/webp→webp) + reverse AVATAR_EXT_TO_MIME
├── commands/
│   ├── impl/             # UploadAvatarCommand { userId, file: { mimetype, buffer } }
│   └── handlers/         # UploadAvatarHandler — writes <uuid>.<ext> to storage, UpdateUserAvatarCommand, deletes the previous file;
│                          #   on error removes the just-written file; returns ProfileDto
├── queries/
│   ├── impl/             # GetProfileQuery { userId }; GetAvatarContentQuery { key }
│   └── handlers/         # GetProfileHandler — reads User via QueryBus(FindUserByIdQuery), builds ProfileDto;
│                          #   GetAvatarContentHandler — { stream, mimeType }; 404 if ext is unknown / no User has that avatarKey / binary missing on disk
└── dto/
    ├── profile.dto.ts               # response shape { id, email, name, avatarUrl, createdAt } + toProfileDto
    │                                #   (avatarUrl = avatarKey ? '/users/avatars/' + avatarKey : null)
    ├── update-profile-name.dto.ts   # class-validator: name — @Transform trim + @Length(1, 50)
    ├── uploaded-avatar-part.ts       # narrow multipart avatar-part type { mimetype, buffer } (no @types/multer)
    └── avatar-content.ts            # GetAvatarContentQuery response body { stream, mimeType }
```

## Notes

- **Profile.** `User.name` (nullable) and `User.avatarKey` (nullable, avatar file key `<uuid>.<ext>`) are fields on the Prisma `User` model. `GET /users/me` / `PATCH /users/me` / `PUT /users/me/avatar` read / change the current user's profile (`request.user.userId` from `JwtAuthGuard`); `profile` stores no Prisma models of its own — `User` read / write only via `users` (`FindUserByIdQuery` / `FindUserByAvatarKeyQuery` / `UpdateUserProfileCommand` / `UpdateUserAvatarCommand`). The response (`ProfileDto`) is assembled by `GetProfileHandler`. `PATCH` takes `{ name }` (`UpdateProfileNameDto`: `@Transform` trim + `@Length(1, 50)` — empty-after-trim or length > 50 → `400`, the DB value is not changed).
- **Avatar.** `PUT /users/me/avatar` follows [`.claude/rules/file-upload.md`](../../../../.claude/rules/file-upload.md). Module specifics: multipart field `file`; `fileFilter` by `AVATAR_MIME_TO_EXT` = `image/jpeg | image/png | image/webp` → `400`; `limits.fileSize` default 5 MiB → `413`. `UploadAvatarHandler` writes key `<randomUUID>.<ext>` (mime lives nowhere in the DB — recovered from the extension on serve), calls `UpdateUserAvatarCommand`, then `storage.remove` of the previous file. Public serving is a separate `AvatarController` **without** `JwtAuthGuard`: `GET /users/avatars/:key` → `StreamableFile`, `Content-Type` from `AVATAR_EXT_TO_MIME`; `GetAvatarContentHandler` → `404` if the extension is not whitelisted, no `User` has that `avatarKey`, or the binary is missing on disk.
- **E2e.** `test/profile.e2e-spec.ts` — `GET` / `PATCH /users/me` under a Bearer token; 401 without a token; `PATCH` → 400 for empty (after trim) and > 50 chars, without changing the DB. `test/profile-avatar.e2e-spec.ts` — `PUT /users/me/avatar`: 401 without a token, 200 + `avatarUrl` for `image/*` ≤ the limit, 413 above `MAX_UPLOAD_SIZE_BYTES`, 400 for non-image (avatar unchanged); public `GET /users/avatars/:key` serves the binary with its mime, 404 for an unknown key; a re-upload changes `avatarUrl`, the old URL → 404.
