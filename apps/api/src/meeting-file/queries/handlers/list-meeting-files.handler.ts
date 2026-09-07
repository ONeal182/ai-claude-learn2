import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { GetMeetingByIdQuery } from '../../../meeting/queries/impl/get-meeting-by-id.query.js';
import { toMeetingFileDto, type MeetingFileDto } from '../../dto/meeting-file.dto.js';
import { ListMeetingFilesQuery } from '../impl/list-meeting-files.query.js';

@Injectable()
@QueryHandler(ListMeetingFilesQuery)
export class ListMeetingFilesHandler implements IQueryHandler<
  ListMeetingFilesQuery,
  MeetingFileDto[]
> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: ListMeetingFilesQuery): Promise<MeetingFileDto[]> {
    // 404, если встречи нет или она не принадлежит пользователю
    await this.queryBus.execute(new GetMeetingByIdQuery(query.meetingId, query.ownerId));

    const files = await this.prisma.meetingFile.findMany({
      where: { meetingId: query.meetingId },
      orderBy: { createdAt: 'desc' },
    });
    return files.map(toMeetingFileDto);
  }
}
