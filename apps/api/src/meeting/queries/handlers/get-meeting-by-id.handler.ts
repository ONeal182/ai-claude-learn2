import { Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { Meeting } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { GetMeetingByIdQuery } from '../impl/get-meeting-by-id.query.js';

@Injectable()
@QueryHandler(GetMeetingByIdQuery)
export class GetMeetingByIdHandler implements IQueryHandler<GetMeetingByIdQuery, Meeting> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetMeetingByIdQuery): Promise<Meeting> {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: query.id } });
    if (!meeting) {
      throw new NotFoundException(`Meeting ${query.id} not found`);
    }
    return meeting;
  }
}
