import { ConflictException, Injectable } from '@nestjs/common';
import { CommandBus, CommandHandler, EventBus, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { hash } from 'bcryptjs';
import type { User } from '@prisma/client';
import { AuthTokenService, type AuthResult } from '../../services/auth-token.service.js';
import { FindUserByEmailQuery } from '../../../users/queries/impl/find-user-by-email.query.js';
import { CreateUserCommand } from '../../../users/commands/impl/create-user.command.js';
import { UserRegisteredEvent } from '../../events/impl/user-registered.event.js';
import { RegisterCommand } from '../impl/register.command.js';

const PASSWORD_SALT_ROUNDS = 10;

@Injectable()
@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<RegisterCommand, AuthResult> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly eventBus: EventBus,
    private readonly authTokenService: AuthTokenService,
  ) {}

  async execute(command: RegisterCommand): Promise<AuthResult> {
    const { email, password } = command;

    const existing: User | null = await this.queryBus.execute(new FindUserByEmailQuery(email));
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await hash(password, PASSWORD_SALT_ROUNDS);
    const user: User = await this.commandBus.execute(new CreateUserCommand(email, passwordHash));

    this.eventBus.publish(new UserRegisteredEvent(user.id, user.email));

    return this.authTokenService.issue(user);
  }
}
