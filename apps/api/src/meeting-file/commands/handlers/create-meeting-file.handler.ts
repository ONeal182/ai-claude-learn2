import { Injectable } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { MeetingFileStatus, MeetingFileType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { GetMeetingByIdQuery } from '../../../meeting/queries/impl/get-meeting-by-id.query.js';
import { toMeetingFileDto, type MeetingFileDto } from '../../dto/meeting-file.dto.js';
import { MeetingFileProcessingRequestedEvent } from '../../events/impl/meeting-file-processing-requested.event.js';
import { FileStorageService } from '../../../storage/file-storage.service.js';
import { CreateMeetingFileCommand } from '../impl/create-meeting-file.command.js';

@Injectable()
@CommandHandler(CreateMeetingFileCommand)
export class CreateMeetingFileHandler implements ICommandHandler<
  CreateMeetingFileCommand,
  MeetingFileDto
> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
    private readonly eventBus: EventBus,
    private readonly storage: FileStorageService,
  ) {}

  async execute(command: CreateMeetingFileCommand): Promise<MeetingFileDto> {
    // 404, если встречи нет — переиспользуем чтение из meeting-модуля, не дублируем.
    await this.queryBus.execute(new GetMeetingByIdQuery(command.meetingId));

    const storageKey = randomUUID();
    await this.storage.save(storageKey, command.file.buffer);

    try {
      const isRecording = command.type === MeetingFileType.recording;
      const file = await this.prisma.meetingFile.create({
        data: {
          meetingId: command.meetingId,
          type: command.type,
          status: isRecording ? MeetingFileStatus.pending : MeetingFileStatus.done,
          originalName: command.file.originalname,
          mimeType: command.file.mimetype,
          size: command.file.size,
          storageKey,
        },
      });

      // побочный эффект после успешной команды — через EventBus (паттерн проекта);
      // фоновой обработке подлежит только `recording` — решаем здесь, обработчик события безусловен
      if (isRecording) {
        this.eventBus.publish(new MeetingFileProcessingRequestedEvent(file.id));
      }

      return toMeetingFileDto(file);
    } catch (error) {
      // на диске не должно оставаться «сирот», если запись в БД не удалась
      await this.storage.remove(storageKey).catch(() => undefined);
      throw error;
    }
  }
}
