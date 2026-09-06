import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import type { MeetingFile } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { GetMeetingFileQuery } from '../../queries/impl/get-meeting-file.query.js';
import { FileStorageService } from '../../../storage/file-storage.service.js';
import { DeleteMeetingFileCommand } from '../impl/delete-meeting-file.command.js';

@Injectable()
@CommandHandler(DeleteMeetingFileCommand)
export class DeleteMeetingFileHandler implements ICommandHandler<DeleteMeetingFileCommand, void> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
    private readonly storage: FileStorageService,
  ) {}

  async execute(command: DeleteMeetingFileCommand): Promise<void> {
    // 404, если файла нет / он у другой встречи — читаем через единый источник, не дублируем findFirst
    const file = await this.queryBus.execute<GetMeetingFileQuery, MeetingFile>(
      new GetMeetingFileQuery(command.meetingId, command.fileId),
    );

    // транскрипт хранится колонкой `transcriptText` этой же строки — удаляется вместе с ней;
    // если файл сейчас в очереди/обработке, воркер поймает P2025 и молча остановится
    await this.prisma.meetingFile.delete({ where: { id: file.id } });
    await this.storage.remove(file.storageKey).catch(() => undefined);
  }
}
