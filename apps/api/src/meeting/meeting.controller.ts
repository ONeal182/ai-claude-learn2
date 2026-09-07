import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { Meeting } from '@prisma/client';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/guards/jwt-auth.guard.js';
import { CreateMeetingCommand } from './commands/impl/create-meeting.command.js';
import { ListMeetingsQuery } from './queries/impl/list-meetings.query.js';
import { GetMeetingByIdQuery } from './queries/impl/get-meeting-by-id.query.js';
import { CreateMeetingDto } from './dto/create-meeting.dto.js';

@Controller('meetings')
@UseGuards(JwtAuthGuard)
export class MeetingController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateMeetingDto): Promise<Meeting> {
    return this.commandBus.execute(
      new CreateMeetingCommand(request.user!.userId, dto.title, dto.startsAt),
    );
  }

  @Get()
  list(@Req() request: AuthenticatedRequest): Promise<Meeting[]> {
    return this.queryBus.execute(new ListMeetingsQuery(request.user!.userId));
  }

  @Get(':id')
  getById(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<Meeting> {
    return this.queryBus.execute(new GetMeetingByIdQuery(id, request.user!.userId));
  }
}
