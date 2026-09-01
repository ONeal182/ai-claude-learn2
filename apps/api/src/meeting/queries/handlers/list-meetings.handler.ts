import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { Meeting } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ListMeetingsQuery } from '../impl/list-meetings.query.js';

@Injectable()
@QueryHandler(ListMeetingsQuery)
export class ListMeetingsHandler implements IQueryHandler<ListMeetingsQuery, Meeting[]> {
  constructor(private readonly prisma: PrismaService) {}

  execute(): Promise<Meeting[]> {
    return this.prisma.meeting.findMany({ orderBy: { createdAt: 'desc' } });
  }
}
