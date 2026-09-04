import { Injectable, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { FileStorageService } from '../../file-storage.service.js';
import { DeleteMeetingFileCommand } from '../impl/delete-meeting-file.command.js';

@Injectable()
@CommandHandler(DeleteMeetingFileCommand)
export class DeleteMeetingFileHandler implements ICommandHandler<DeleteMeetingFileCommand, void> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
  ) {}

  async execute(command: DeleteMeetingFileCommand): Promise<void> {
    const file = await this.prisma.meetingFile.findFirst({
      where: { id: command.fileId, meetingId: command.meetingId },
    });
    if (!file) {
      throw new NotFoundException(`Файл ${command.fileId} не найден`);
    }

    await this.prisma.meetingFile.delete({ where: { id: file.id } });
    await this.storage.remove(file.storageKey).catch(() => undefined);
  }
}
