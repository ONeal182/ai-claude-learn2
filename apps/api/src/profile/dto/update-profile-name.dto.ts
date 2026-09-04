import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class UpdateProfileNameDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 50)
  name!: string;
}
