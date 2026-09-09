import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Meeting } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CreateMeetingCommand } from './commands/impl/create-meeting.command.js';
import { RegenerateMeetingSummaryCommand } from './commands/impl/regenerate-meeting-summary.command.js';
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
  create(@Body() dto: CreateMeetingDto, @CurrentUser('userId') userId: string): Promise<Meeting> {
    return this.commandBus.execute(new CreateMeetingCommand(dto.title, dto.startsAt, userId));
  }

  @Get()
  list(@CurrentUser('userId') userId: string): Promise<Meeting[]> {
    return this.queryBus.execute(new ListMeetingsQuery(userId));
  }

  @Get(':id')
  getById(@Param('id') id: string, @CurrentUser('userId') userId: string): Promise<Meeting> {
    return this.queryBus.execute(new GetMeetingByIdQuery(id, userId));
  }

  @Post(':id/regenerate-summary')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  regenerateSummary(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ): Promise<Meeting> {
    return this.commandBus.execute(new RegenerateMeetingSummaryCommand(id, userId));
  }
}
