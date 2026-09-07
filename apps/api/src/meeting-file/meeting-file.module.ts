import { BadRequestException, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ALLOWED_UPLOAD_MIME_TYPES } from './allowed-mime.js';
import { MeetingFileController } from './meeting-file.controller.js';
import { MeetingFileProcessingQueue } from './processing/meeting-file-processing.queue.js';
import { PROCESS_RUNNER, SpawnProcessRunner } from './processing/process-runner.js';
import { STT_SERVICE, StubSttService, type SttService } from './processing/stt.service.js';
import { resolveSttEngine } from './processing/stt-engine.js';
import { WhisperSttService } from './processing/whisper-stt.service.js';
import { CommandHandlers } from './commands/handlers/index.js';
import { QueryHandlers } from './queries/handlers/index.js';
import { EventHandlers } from './events/handlers/index.js';

/** 25 МиБ — дефолт, если `MAX_UPLOAD_SIZE_BYTES` не задан в окружении. */
const DEFAULT_MAX_UPLOAD_SIZE_BYTES = 26_214_400;

@Module({
  imports: [
    AuthModule,
    StorageModule,
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
    MeetingFileProcessingQueue,
    { provide: PROCESS_RUNNER, useClass: SpawnProcessRunner },
    StubSttService,
    WhisperSttService,
    {
      // Выбор движка по `STT_ENGINE` (`whisper` | `stub`, дефолт `DEFAULT_STT_ENGINE` = `whisper`).
      // Нормализация значения — общий `resolveSttEngine` (тот же, что в `validateEnv`).
      // Обе реализации инстанцирует Nest (со своими зависимостями) — фабрика лишь выбирает.
      provide: STT_SERVICE,
      inject: [ConfigService, StubSttService, WhisperSttService],
      useFactory: (
        config: ConfigService,
        stub: StubSttService,
        whisper: WhisperSttService,
      ): SttService => {
        return resolveSttEngine(config.get<string>('STT_ENGINE')) === 'whisper' ? whisper : stub;
      },
    },
    ...CommandHandlers,
    ...QueryHandlers,
    ...EventHandlers,
  ],
})
export class MeetingFileModule {}
