import type { MeetingFile, MeetingFileStatus } from '@prisma/client';

/**
 * Форма файла встречи в ответах API. `storageKey` наружу не отдаём —
 * ключ бинарника в хранилище внутренний (PRD: «в записи хранится только путь/ключ»).
 *
 * Поля summary, summaryStatus и decisions перенесены на уровень Meeting —
 * резюме создаётся для всей встречи, а не для отдельных файлов.
 * Включаем их в DTO для удобства клиента.
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
  summaryStatus: MeetingFileStatus | null;
  summary: string | null;
  decisions: unknown | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toMeetingFileDto(
  file: MeetingFile & {
    meeting: {
      summaryStatus: MeetingFileStatus | null;
      summary: string | null;
      decisions: unknown | null;
    };
  },
): MeetingFileDto {
  return {
    id: file.id,
    meetingId: file.meetingId,
    type: file.type,
    status: file.status,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    transcriptText: file.transcriptText,
    summaryStatus: file.meeting.summaryStatus,
    summary: file.meeting.summary,
    decisions: file.meeting.decisions,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
}
