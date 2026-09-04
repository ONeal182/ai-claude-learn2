import type { MeetingFile } from '@prisma/client';

/** Файл встречи успешно загружен и записан в БД. Публикуется `CreateMeetingFileHandler`. */
export class MeetingFileUploadedEvent {
  constructor(
    public readonly fileId: string,
    public readonly type: MeetingFile['type'],
  ) {}
}
