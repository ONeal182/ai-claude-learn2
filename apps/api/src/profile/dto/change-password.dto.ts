import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export const MIN_PASSWORD_LENGTH = 8;

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  newPassword!: string;
}
