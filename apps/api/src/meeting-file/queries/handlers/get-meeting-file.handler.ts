import { Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { GetMeetingFileQuery } from '../impl/get-meeting-file.query.js';
import { toMeetingFileDto, type MeetingFileDto } from '../../dto/meeting-file.dto.js';

@Injectable()
@QueryHandler(GetMeetingFileQuery)
export class GetMeetingFileHandler implements IQueryHandler<GetMeetingFileQuery, MeetingFileDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetMeetingFileQuery): Promise<MeetingFileDto> {
    const file = await this.prisma.meetingFile.findUnique({
      where: { id: query.fileId },
    });

    if (!file || file.meetingId !== query.meetingId) {
      throw new NotFoundException(`Файл ${query.fileId} не найден`);
    }

    return toMeetingFileDto(file);
  }
}
