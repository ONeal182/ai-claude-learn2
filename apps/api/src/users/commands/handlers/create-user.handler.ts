import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { User } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CreateUserCommand } from '../impl/create-user.command.js';

@Injectable()
@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand, User> {
  constructor(private readonly prisma: PrismaService) {}

  execute(command: CreateUserCommand): Promise<User> {
    return this.prisma.user.create({
      data: { email: command.email, password: command.passwordHash },
    });
  }
}
