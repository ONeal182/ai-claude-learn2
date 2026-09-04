/**
 * Узкий тип загруженной части multipart-запроса — только поля, которые реально используем.
 * `@types/multer` в проекте нет (глобальный `Express.Multer.File` недоступен), а тянуть его
 * ради четырёх полей не нужно — правило «минимум зависимостей».
 */
export interface UploadedFilePart {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
