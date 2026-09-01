import { Injectable } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import type { Meeting } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { MeetingCreatedEvent } from '../../events/impl/meeting-created.event.js';
import { CreateMeetingCommand } from '../impl/create-meeting.command.js';

@Injectable()
@CommandHandler(CreateMeetingCommand)
export class CreateMeetingHandler implements ICommandHandler<CreateMeetingCommand, Meeting> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateMeetingCommand): Promise<Meeting> {
    const meeting = await this.prisma.meeting.create({
      data: {
        title: command.title,
        startsAt: new Date(command.startsAt),
      },
    });

    this.eventBus.publish(new MeetingCreatedEvent(meeting.id, meeting.title));

    return meeting;
  }
}
