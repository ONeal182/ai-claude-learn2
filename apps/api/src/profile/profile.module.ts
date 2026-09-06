import { BadRequestException, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { AVATAR_MIME_TO_EXT } from './avatar-mime.js';
import { AvatarController } from './avatar.controller.js';
import { ProfileController } from './profile.controller.js';
import { CommandHandlers } from './commands/handlers/index.js';
import { QueryHandlers } from './queries/handlers/index.js';

/** 5 МиБ — дефолт лимита аватара, если `MAX_UPLOAD_SIZE_BYTES` не задан в окружении. */
const DEFAULT_AVATAR_MAX_SIZE_BYTES = 5_242_880;

@Module({
  imports: [
    AuthModule,
    StorageModule,
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // memoryStorage по умолчанию: файл в буфере, на диск пишем в хендлере после проверок
        limits: {
          fileSize: Number(
            config.get<string | number>('MAX_UPLOAD_SIZE_BYTES', DEFAULT_AVATAR_MAX_SIZE_BYTES),
          ),
        },
        fileFilter: (
          _req: unknown,
          file: { mimetype: string },
          cb: (error: Error | null, acceptFile: boolean) => void,
        ) => {
          if (AVATAR_MIME_TO_EXT.has(file.mimetype)) {
            cb(null, true);
          } else {
            cb(new BadRequestException(`Недопустимый тип файла: ${file.mimetype}`), false);
          }
        },
      }),
    }),
  ],
  controllers: [ProfileController, AvatarController],
  providers: [...CommandHandlers, ...QueryHandlers],
})
export class ProfileModule {}
