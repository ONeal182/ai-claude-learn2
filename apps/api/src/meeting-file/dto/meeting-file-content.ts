import type { ReadStream } from 'node:fs';

/** Тело ответа `GET /meetings/:id/files/:fileId/content`: поток бинарника + заголовки отдачи. */
export interface MeetingFileContent {
  stream: ReadStream;
  mimeType: string;
  originalName: string;
}
