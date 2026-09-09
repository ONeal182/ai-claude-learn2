import type { MeetingFileStatus } from '@prisma/client';

export interface MeetingUpdateDto {
  type: 'summary_status_changed' | 'file_status_changed';
  meetingId: string;
  summaryStatus?: MeetingFileStatus | null;
  summary?: string | null;
  decisions?: unknown[] | null;
  fileId?: string;
  fileStatus?: MeetingFileStatus;
  timestamp: string;
}
