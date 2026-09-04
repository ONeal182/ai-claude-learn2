import { IsIn } from 'class-validator';
import { MeetingFileType } from '@prisma/client';

const MEETING_FILE_TYPES = Object.values(MeetingFileType);

/** Поле `type` multipart-формы. Валидируется глобальным `ValidationPipe`. */
export class UploadMeetingFileDto {
  @IsIn(MEETING_FILE_TYPES)
  type!: MeetingFileType;
}
