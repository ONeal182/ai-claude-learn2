import { ConflictException, Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import type { MeetingFile } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { toMeetingFileDto, type MeetingFileDto } from '../../dto/meeting-file.dto.js';
import { MeetingFileProcessingQueue } from '../../processing/meeting-file-processing.queue.js';
import { GetMeetingFileQuery } from '../../queries/impl/get-meeting-file.query.js';
import { ReprocessMeetingFileCommand } from '../impl/reprocess-meeting-file.command.js';

/**
 * Ручной перезапуск фоновой обработки. Разрешён только для статуса `failed` — для остальных
 * (`pending` / `processing` / `done`) состояние ресурса операцию не допускает → 409.
 */
@Injectable()
@CommandHandler(ReprocessMeetingFileCommand)
export class ReprocessMeetingFileHandler implements ICommandHandler<
  ReprocessMeetingFileCommand,
  MeetingFileDto
> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
    private readonly queue: MeetingFileProcessingQueue,
  ) {}

  async execute(command: ReprocessMeetingFileCommand): Promise<MeetingFileDto> {
    // чтение записи — через единый источник (404, если файла нет / он у другой встречи)
    const file = await this.queryBus.execute<GetMeetingFileQuery, MeetingFile>(
      new GetMeetingFileQuery(command.meetingId, command.fileId),
    );

    if (file.status !== 'failed') {
      throw new ConflictException(
        `Перезапуск обработки доступен только для статуса «failed» (сейчас «${file.status}»)`,
      );
    }

    const updated = await this.prisma.meetingFile.update({
      where: { id: file.id },
      data: { status: 'pending', transcriptText: null },
    });
    this.queue.enqueue(file.id);

    return toMeetingFileDto(updated);
  }
}
