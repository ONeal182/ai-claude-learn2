import { Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { MeetingFileContent } from '../../dto/meeting-file-content.js';
import { FileStorageService } from '../../../storage/file-storage.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { GetMeetingFileContentQuery } from '../impl/get-meeting-file-content.query.js';

@Injectable()
@QueryHandler(GetMeetingFileContentQuery)
export class GetMeetingFileContentHandler implements IQueryHandler<
  GetMeetingFileContentQuery,
  MeetingFileContent
> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
  ) {}

  async execute(query: GetMeetingFileContentQuery): Promise<MeetingFileContent> {
    const file = await this.prisma.meetingFile.findUnique({
      where: { id: query.fileId },
    });

    if (!file || file.meetingId !== query.meetingId) {
      throw new NotFoundException(`Файл ${query.fileId} не найден`);
    }

    // запись есть, а бинарник на диске пропал — это 404, а не 500 от упавшего потока
    if (!(await this.storage.exists(file.storageKey))) {
      throw new NotFoundException(`Файл ${query.fileId} не найден`);
    }

    return {
      stream: this.storage.createReadStream(file.storageKey),
      mimeType: file.mimeType,
      originalName: file.originalName,
    };
  }
}
