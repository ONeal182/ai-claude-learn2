import { ConflictException, Injectable } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { MeetingFileStatus, type MeetingFile } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { toMeetingFileDto, type MeetingFileDto } from '../../dto/meeting-file.dto.js';
import { MeetingFileProcessingRequestedEvent } from '../../events/impl/meeting-file-processing-requested.event.js';
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
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: ReprocessMeetingFileCommand): Promise<MeetingFileDto> {
    // 404, если файла нет / он у другой встречи — читаем через единый источник
    await this.queryBus.execute<GetMeetingFileQuery, MeetingFile>(
      new GetMeetingFileQuery(command.meetingId, command.fileId),
    );

    // атомарный переход failed → pending: guard в `where`, а не отдельная проверка перед update,
    // чтобы два параллельных reprocess не поставили файл в очередь дважды
    const { count } = await this.prisma.meetingFile.updateMany({
      where: { id: command.fileId, status: MeetingFileStatus.failed },
      data: { status: MeetingFileStatus.pending, transcriptText: null },
    });
    if (count === 0) {
      throw new ConflictException(
        'Перезапуск обработки доступен только для файлов со статусом «failed»',
      );
    }

    // перечитываем актуальную строку (ещё `pending` — событие публикуем после) для ответа
    const updated = await this.queryBus.execute<GetMeetingFileQuery, MeetingFile>(
      new GetMeetingFileQuery(command.meetingId, command.fileId),
    );
    this.eventBus.publish(new MeetingFileProcessingRequestedEvent(command.fileId));

    return toMeetingFileDto(updated);
  }
}
