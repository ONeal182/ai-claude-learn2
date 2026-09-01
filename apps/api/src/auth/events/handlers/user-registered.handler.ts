import { Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { UserRegisteredEvent } from '../impl/user-registered.event.js';

@Injectable()
@EventsHandler(UserRegisteredEvent)
export class UserRegisteredHandler implements IEventHandler<UserRegisteredEvent> {
  private readonly logger = new Logger(UserRegisteredHandler.name);

  handle(event: UserRegisteredEvent): void {
    this.logger.log(`Пользователь зарегистрирован: ${event.email} (${event.userId})`);
  }
}
