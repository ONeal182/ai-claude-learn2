import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { Meeting } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
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
  create(@Body() dto: CreateMeetingDto): Promise<Meeting> {
    return this.commandBus.execute(new CreateMeetingCommand(dto.title, dto.startsAt));
  }

  @Get()
  list(): Promise<Meeting[]> {
    return this.queryBus.execute(new ListMeetingsQuery());
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<Meeting> {
    return this.queryBus.execute(new GetMeetingByIdQuery(id));
  }
}
