import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export const MAX_PROFILE_NAME_LENGTH = 50;

export class UpdateProfileNameDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, MAX_PROFILE_NAME_LENGTH)
  name!: string;
}
