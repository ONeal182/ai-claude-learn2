import { IsIn } from 'class-validator';

/** Поле `type` multipart-формы. Валидируется глобальным `ValidationPipe`. */
export class UploadMeetingFileDto {
  @IsIn(['recording', 'attachment'])
  type!: 'recording' | 'attachment';
}
