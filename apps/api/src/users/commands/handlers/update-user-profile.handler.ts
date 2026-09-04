import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { User } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { UpdateUserProfileCommand } from '../impl/update-user-profile.command.js';

@Injectable()
@CommandHandler(UpdateUserProfileCommand)
export class UpdateUserProfileHandler implements ICommandHandler<UpdateUserProfileCommand, User> {
  constructor(private readonly prisma: PrismaService) {}

  execute(command: UpdateUserProfileCommand): Promise<User> {
    return this.prisma.user.update({
      where: { id: command.userId },
      data: { name: command.name },
    });
  }
}
