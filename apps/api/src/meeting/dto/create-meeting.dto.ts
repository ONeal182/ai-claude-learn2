import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class CreateMeetingDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsDateString()
  startsAt!: string;
}
