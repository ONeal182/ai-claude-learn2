import { BadRequestException, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { AuthModule } from '../auth/auth.module.js';
import { FileStorageService } from '../storage/file-storage.service.js';
import { StorageModule } from '../storage/storage.module.js';
import { ALLOWED_UPLOAD_MIME_TYPES } from './allowed-mime.js';
import { MeetingFileController } from './meeting-file.controller.js';
import { MeetingFileProcessingQueue } from './processing/meeting-file-processing.queue.js';
import {
  PROCESS_RUNNER,
  SpawnProcessRunner,
  type ProcessRunner,
} from './processing/process-runner.js';
import {
  DEFAULT_STT_ENGINE,
  STT_SERVICE,
  StubSttService,
  type SttEngine,
  type SttService,
} from './processing/stt.service.js';
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
      // Выбор движка по `STT_ENGINE` (`whisper` | `stub`). Дефолт на Фазе 1 — `stub`:
      // безопасно для локалки без установленного whisper.cpp. Фаза 4 переключит на `whisper`.
      provide: STT_SERVICE,
      inject: [ConfigService, PROCESS_RUNNER, FileStorageService],
      useFactory: (
        config: ConfigService,
        runner: ProcessRunner,
        storage: FileStorageService,
      ): SttService => {
        const engine = (config.get<string>('STT_ENGINE') ?? DEFAULT_STT_ENGINE) as SttEngine;
        if (engine === 'whisper') return new WhisperSttService(runner, config, storage);
        if (engine === 'stub') return new StubSttService();
        throw new Error(`Неизвестный STT_ENGINE: ${engine}`);
      },
    },
    ...CommandHandlers,
    ...QueryHandlers,
    ...EventHandlers,
  ],
})
export class MeetingFileModule {}
