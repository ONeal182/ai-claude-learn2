import type { MeetingFile } from '@prisma/client';
import type { UploadedFilePart } from '../../dto/uploaded-file-part.js';

export class CreateMeetingFileCommand {
  constructor(
    public readonly meetingId: string,
    public readonly type: MeetingFile['type'],
    public readonly file: UploadedFilePart,
  ) {}
}
