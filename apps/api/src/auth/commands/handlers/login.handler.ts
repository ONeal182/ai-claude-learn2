import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { compare } from 'bcryptjs';
import type { User } from '@prisma/client';
import { AuthTokenService, type AuthResult } from '../../services/auth-token.service.js';
import { FindUserByEmailQuery } from '../../queries/impl/find-user-by-email.query.js';
import { UserLoggedInEvent } from '../../events/impl/user-logged-in.event.js';
import { LoginCommand } from '../impl/login.command.js';

@Injectable()
@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand, AuthResult> {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly eventBus: EventBus,
    private readonly authTokenService: AuthTokenService,
  ) {}

  async execute(command: LoginCommand): Promise<AuthResult> {
    const { email, password } = command;

    // Одинаковое сообщение для "нет такого email" и "неверный пароль" —
    // чтобы ответ не давал возможности перебором узнать, зарегистрирован ли email.
    const user: User | null = await this.queryBus.execute(new FindUserByEmailQuery(email));
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await compare(password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    this.eventBus.publish(new UserLoggedInEvent(user.id, user.email));

    return this.authTokenService.issue(user);
  }
}
