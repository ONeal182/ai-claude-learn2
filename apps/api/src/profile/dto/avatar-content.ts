import type { ReadStream } from 'node:fs';

/** Тело ответа публичной отдачи аватара: поток бинарника + его mime. */
export interface AvatarContent {
  stream: ReadStream;
  mimeType: string;
}
