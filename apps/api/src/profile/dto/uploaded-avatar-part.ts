/**
 * Узкий тип загруженной части multipart-запроса для аватара — только нужные поля.
 * `@types/multer` в проекте нет; тянуть его ради двух полей не нужно.
 */
export interface UploadedAvatarPart {
  mimetype: string;
  buffer: Buffer;
}
