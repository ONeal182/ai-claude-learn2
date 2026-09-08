import { BadRequestException, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { MulterModule } from '@nestjs/platform-express';
import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ClaudeAgentModule } from '../claude-agent/claude-agent.module.js';
import { ALLOWED_UPLOAD_MIME_TYPES } from './allowed-mime.js';
import { MeetingFileController } from './meeting-file.controller.js';
import { MeetingFileProcessingQueue } from './processing/meeting-file-processing.queue.js';
import { MeetingFileSummaryQueue } from './processing/meeting-file-summary.queue.js';
import { PROCESS_RUNNER, SpawnProcessRunner } from './processing/process-runner.js';
import { STT_SERVICE, StubSttService, type SttService } from './processing/stt.service.js';
import {
  SUMMARY_SERVICE,
  StubSummaryService,
  type SummaryService,
} from './processing/summary.service.js';
import { resolveSttEngine } from './processing/stt-engine.js';
import { resolveSummaryEngine } from './processing/summary-engine.js';
import { WhisperSttService } from './processing/whisper-stt.service.js';
import { ClaudeSummaryService } from './processing/claude-summary.service.js';
import { CommandHandlers } from './commands/handlers/index.js';
import { QueryHandlers } from './queries/handlers/index.js';
import { EventHandlers } from './events/handlers/index.js';

/** 25 МиБ — дефолт, если `MAX_UPLOAD_SIZE_BYTES` не задан в окружении. */
const DEFAULT_MAX_UPLOAD_SIZE_BYTES = 26_214_400;

@Module({
  imports: [
    CqrsModule,
    AuthModule,
    StorageModule,
    ClaudeAgentModule,
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
    MeetingFileSummaryQueue,
    { provide: PROCESS_RUNNER, useClass: SpawnProcessRunner },
    StubSttService,
    WhisperSttService,
    StubSummaryService,
    ClaudeSummaryService,
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
    {
      // Выбор движка по `SUMMARY_ENGINE` (`claude` | `stub`, дефолт `DEFAULT_SUMMARY_ENGINE` = `claude`).
      // Нормализация значения — общий `resolveSummaryEngine` (тот же, что в `validateEnv`).
      // Обе реализации инстанцирует Nest (со своими зависимостями) — фабрика лишь выбирает.
      provide: SUMMARY_SERVICE,
      inject: [ConfigService, StubSummaryService, ClaudeSummaryService],
      useFactory: (
        config: ConfigService,
        stub: StubSummaryService,
        claude: ClaudeSummaryService,
      ): SummaryService => {
        return resolveSummaryEngine(config.get<string>('SUMMARY_ENGINE')) === 'claude'
          ? claude
          : stub;
      },
    },
    ...CommandHandlers,
    ...QueryHandlers,
    ...EventHandlers,
  ],
})
export class MeetingFileModule {}
