import type { MeetingFile } from '@prisma/client';

/**
 * Форма файла встречи в ответах API. `storageKey` наружу не отдаём —
 * ключ бинарника в хранилище внутренний (PRD: «в записи хранится только путь/ключ»).
 */
export interface MeetingFileDto {
  id: string;
  meetingId: string;
  type: MeetingFile['type'];
  status: MeetingFile['status'];
  originalName: string;
  mimeType: string;
  size: number;
  transcriptText: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toMeetingFileDto(file: MeetingFile): MeetingFileDto {
  return {
    id: file.id,
    meetingId: file.meetingId,
    type: file.type,
    status: file.status,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    transcriptText: file.transcriptText,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
}
