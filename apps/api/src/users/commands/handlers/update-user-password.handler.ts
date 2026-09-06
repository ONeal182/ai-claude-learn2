import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { User } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { UpdateUserPasswordCommand } from '../impl/update-user-password.command.js';

@Injectable()
@CommandHandler(UpdateUserPasswordCommand)
export class UpdateUserPasswordHandler implements ICommandHandler<UpdateUserPasswordCommand, User> {
  constructor(private readonly prisma: PrismaService) {}

  execute(command: UpdateUserPasswordCommand): Promise<User> {
    return this.prisma.user.update({
      where: { id: command.userId },
      data: { password: command.passwordHash },
    });
  }
}
