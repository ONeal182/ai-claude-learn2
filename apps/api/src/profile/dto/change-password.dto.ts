import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export const MIN_PASSWORD_LENGTH = 8;
/** bcrypt молча обрезает вход на 72 байтах — не даём завести пароль, часть которого игнорируется. */
export const MAX_PASSWORD_LENGTH = 72;

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  newPassword!: string;
}
