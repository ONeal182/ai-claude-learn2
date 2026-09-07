import { Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs';
import type { Meeting, MeetingFile } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { GetMeetingByIdQuery } from '../../../meeting/queries/impl/get-meeting-by-id.query.js';
import { GetMeetingFileQuery } from '../impl/get-meeting-file.query.js';

/**
 * Единственная точка чтения одной записи `MeetingFile` из Prisma (`arch-single-source-of-read`):
 * сперва проверяет, что встреча принадлежит текущему пользователю (через `GetMeetingByIdQuery` —
 * 404 для чужой/несуществующей встречи), затем ищет файл по паре (id, meetingId) — иначе 404.
 * Потребители: `GetMeetingFileContentHandler`, `DeleteMeetingFileHandler`, `ReprocessMeetingFileHandler`.
 */
@Injectable()
@QueryHandler(GetMeetingFileQuery)
export class GetMeetingFileHandler implements IQueryHandler<GetMeetingFileQuery, MeetingFile> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: GetMeetingFileQuery): Promise<MeetingFile> {
    // 404, если встречи нет или она не принадлежит пользователю — не палим наличие ресурса
    await this.queryBus.execute<GetMeetingByIdQuery, Meeting>(
      new GetMeetingByIdQuery(query.meetingId, query.ownerId),
    );

    const file = await this.prisma.meetingFile.findFirst({
      where: { id: query.fileId, meetingId: query.meetingId },
    });
    if (!file) {
      throw new NotFoundException(`Файл ${query.fileId} не найден`);
    }
    return file;
  }
}
