import { Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { ReadStream } from 'node:fs';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { FileStorageService } from '../../file-storage.service.js';
import { GetMeetingFileContentQuery } from '../impl/get-meeting-file-content.query.js';

export interface MeetingFileContent {
  stream: ReadStream;
  mimeType: string;
  originalName: string;
}

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
    const file = await this.prisma.meetingFile.findFirst({
      where: { id: query.fileId, meetingId: query.meetingId },
    });
    if (!file) {
      throw new NotFoundException(`Файл ${query.fileId} не найден`);
    }

    return {
      stream: this.storage.createReadStream(file.storageKey),
      mimeType: file.mimeType,
      originalName: file.originalName,
    };
  }
}
