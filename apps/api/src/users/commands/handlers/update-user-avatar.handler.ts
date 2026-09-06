import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { User } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { UpdateUserAvatarCommand } from '../impl/update-user-avatar.command.js';

@Injectable()
@CommandHandler(UpdateUserAvatarCommand)
export class UpdateUserAvatarHandler implements ICommandHandler<UpdateUserAvatarCommand, User> {
  constructor(private readonly prisma: PrismaService) {}

  execute(command: UpdateUserAvatarCommand): Promise<User> {
    return this.prisma.user.update({
      where: { id: command.userId },
      data: { avatarKey: command.avatarKey },
    });
  }
}
