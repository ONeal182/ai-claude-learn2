import { Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { MeetingFile } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { GetMeetingFileQuery } from '../impl/get-meeting-file.query.js';

/**
 * Единственная точка чтения одной записи `MeetingFile` из Prisma (`arch-single-source-of-read`):
 * ищет файл по паре (id, meetingId) — чужой встрече файл не отдаётся — или бросает 404.
 * Потребители: `GetMeetingFileContentHandler`, `DeleteMeetingFileHandler`.
 */
@Injectable()
@QueryHandler(GetMeetingFileQuery)
export class GetMeetingFileHandler implements IQueryHandler<GetMeetingFileQuery, MeetingFile> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetMeetingFileQuery): Promise<MeetingFile> {
    const file = await this.prisma.meetingFile.findFirst({
      where: { id: query.fileId, meetingId: query.meetingId },
    });
    if (!file) {
      throw new NotFoundException(`Файл ${query.fileId} не найден`);
    }
    return file;
  }
}
