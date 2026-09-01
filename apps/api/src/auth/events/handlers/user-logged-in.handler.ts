import { Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { UserLoggedInEvent } from '../impl/user-logged-in.event.js';

@Injectable()
@EventsHandler(UserLoggedInEvent)
export class UserLoggedInHandler implements IEventHandler<UserLoggedInEvent> {
  private readonly logger = new Logger(UserLoggedInHandler.name);

  handle(event: UserLoggedInEvent): void {
    this.logger.log(`Пользователь залогинился: ${event.email} (${event.userId})`);
  }
}
