import type { MeetingFileStatus } from '@prisma/client';

export class MeetingStatusChangedEvent {
  constructor(
    public readonly meetingId: string,
    public readonly summaryStatus: MeetingFileStatus,
    public readonly summary: string | null,
    public readonly decisions: unknown[] | null,
  ) {}
}
