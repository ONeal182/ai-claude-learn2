import { ConflictException, Injectable } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { type MeetingFile } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { toMeetingFileDto, type MeetingFileDto } from '../../dto/meeting-file.dto.js';
import { MeetingFileTranscribedEvent } from '../../events/impl/meeting-file-transcribed.event.js';
import { GetMeetingFileQuery } from '../../queries/impl/get-meeting-file.query.js';
import { ResummarizeMeetingFileCommand } from '../impl/resummarize-meeting-file.command.js';

/**
 * Ручной перезапуск суммаризации. Разрешён только для recording файлов со статусом `done`,
 * непустым `transcriptText` и `summaryStatus !== 'processing'`. Устанавливает `summaryStatus='pending'`
 * и публикует событие для запуска `MeetingFileSummaryQueue`.
 */
@Injectable()
@CommandHandler(ResummarizeMeetingFileCommand)
export class ResummarizeMeetingFileHandler implements ICommandHandler<
  ResummarizeMeetingFileCommand,
  MeetingFileDto
> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: ResummarizeMeetingFileCommand): Promise<MeetingFileDto> {
    // 404, если файла нет / он у другой встречи — читаем через единый источник
    const file = await this.queryBus.execute<GetMeetingFileQuery, MeetingFile>(
      new GetMeetingFileQuery(command.meetingId, command.fileId),
    );

    // Проверяем условия для возможности суммаризации
    if (file.type !== 'recording') {
      throw new ConflictException('Суммаризация доступна только для файлов типа recording');
    }

    if (file.status !== 'done') {
      throw new ConflictException('Суммаризация доступна только для файлов со статусом done');
    }

    if (!file.transcriptText) {
      throw new ConflictException('Суммаризация недоступна для файлов без транскрипта');
    }

    if (file.summaryStatus === 'processing') {
      throw new ConflictException('Суммаризация уже выполняется');
    }

    // Устанавливаем summaryStatus='pending'
    await this.prisma.meetingFile.update({
      where: { id: command.fileId },
      data: { summaryStatus: 'pending' },
    });

    // Перечитываем актуальную строку для ответа
    const updated = await this.queryBus.execute<GetMeetingFileQuery, MeetingFile>(
      new GetMeetingFileQuery(command.meetingId, command.fileId),
    );

    // Публикуем событие для запуска суммаризации
    this.eventBus.publish(new MeetingFileTranscribedEvent(command.fileId));

    return toMeetingFileDto(updated);
  }
}
