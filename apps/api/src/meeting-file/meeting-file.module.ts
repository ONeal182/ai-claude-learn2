import { BadRequestException, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { AuthModule } from '../auth/auth.module.js';
import { ALLOWED_UPLOAD_MIME_TYPES } from './allowed-mime.js';
import { MeetingFileController } from './meeting-file.controller.js';
import { FileStorageService } from './file-storage.service.js';
import { MeetingFileProcessingQueue } from './processing/meeting-file-processing.queue.js';
import { STT_SERVICE, StubSttService } from './processing/stt.service.js';
import { CommandHandlers } from './commands/handlers/index.js';
import { QueryHandlers } from './queries/handlers/index.js';
import { EventHandlers } from './events/handlers/index.js';

/** 25 МиБ — дефолт, если `MAX_UPLOAD_SIZE_BYTES` не задан в окружении. */
const DEFAULT_MAX_UPLOAD_SIZE_BYTES = 26_214_400;

@Module({
  imports: [
    AuthModule,
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // memoryStorage по умолчанию: файл в буфере, на диск пишем в хендлере после всех проверок.
        limits: {
          fileSize: Number(
            config.get<string | number>('MAX_UPLOAD_SIZE_BYTES', DEFAULT_MAX_UPLOAD_SIZE_BYTES),
          ),
        },
        fileFilter: (
          _req: unknown,
          file: { mimetype: string },
          cb: (error: Error | null, acceptFile: boolean) => void,
        ) => {
          if (ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
            cb(null, true);
          } else {
            cb(new BadRequestException(`Недопустимый тип файла: ${file.mimetype}`), false);
          }
        },
      }),
    }),
  ],
  controllers: [MeetingFileController],
  providers: [
    FileStorageService,
    MeetingFileProcessingQueue,
    { provide: STT_SERVICE, useClass: StubSttService },
    ...CommandHandlers,
    ...QueryHandlers,
    ...EventHandlers,
  ],
})
export class MeetingFileModule {}
