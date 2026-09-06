import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { compare, hash } from 'bcryptjs';
import type { User } from '@prisma/client';
import { FindUserByIdQuery } from '../../../users/queries/impl/find-user-by-id.query.js';
import { UpdateUserPasswordCommand } from '../../../users/commands/impl/update-user-password.command.js';
import { ChangePasswordCommand } from '../impl/change-password.command.js';

const PASSWORD_SALT_ROUNDS = 10;

@Injectable()
@CommandHandler(ChangePasswordCommand)
export class ChangePasswordHandler implements ICommandHandler<ChangePasswordCommand, void> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(command: ChangePasswordCommand): Promise<void> {
    const { userId, currentPassword, newPassword } = command;

    // Читаем User только через users-модуль (QueryBus), не напрямую через Prisma.
    const user: User | null = await this.queryBus.execute(new FindUserByIdQuery(userId));
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const currentPasswordMatches = await compare(currentPassword, user.password);
    if (!currentPasswordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Хеширование — ответственность auth; users принимает уже готовый passwordHash.
    const passwordHash = await hash(newPassword, PASSWORD_SALT_ROUNDS);
    await this.commandBus.execute(new UpdateUserPasswordCommand(userId, passwordHash));
  }
}
