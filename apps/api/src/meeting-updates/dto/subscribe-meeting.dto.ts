import { IsString } from 'class-validator';

export class SubscribeMeetingDto {
  @IsString()
  meetingId: string;
}
