import { Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { MeetingCreatedEvent } from '../impl/meeting-created.event.js';

@Injectable()
@EventsHandler(MeetingCreatedEvent)
export class MeetingCreatedHandler implements IEventHandler<MeetingCreatedEvent> {
  private readonly logger = new Logger(MeetingCreatedHandler.name);

  handle(event: MeetingCreatedEvent): void {
    this.logger.log(`Встреча создана: ${event.title} (${event.meetingId})`);
  }
}
