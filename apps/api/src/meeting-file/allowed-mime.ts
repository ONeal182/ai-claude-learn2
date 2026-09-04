/**
 * Белый список mime-типов для загрузки файлов встречи.
 * Единый на оба вида (`recording` и `attachment`): клиент присылает `type` отдельным полем,
 * содержимое не валидируем (антивирус/детект контента — вне скоупа PRD).
 * mime не из этого набора → `fileFilter` в `MeetingFileModule` бросает `BadRequestException` (400).
 */
export const ALLOWED_UPLOAD_MIME_TYPES: ReadonlySet<string> = new Set<string>([
  // recording — аудио/видео
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  // attachment — документы, слайды, изображения, заметки
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
