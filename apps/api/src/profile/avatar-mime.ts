/**
 * Белый список mime аватара ↔ расширение файла.
 *
 * Расширение — часть `storageKey` (`<uuid>.<ext>`): mime нигде в БД не хранится,
 * публичная отдача `GET /users/avatars/:key` восстанавливает `Content-Type` из ключа.
 * mime не из этого набора → `fileFilter` в `ProfileModule` бросает `BadRequestException` (400).
 */
export const AVATAR_MIME_TO_EXT: ReadonlyMap<string, string> = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

export const AVATAR_EXT_TO_MIME: ReadonlyMap<string, string> = new Map<string, string>(
  [...AVATAR_MIME_TO_EXT].map(([mime, ext]) => [ext, mime]),
);
