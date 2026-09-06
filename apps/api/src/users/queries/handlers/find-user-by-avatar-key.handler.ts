import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { User } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { FindUserByAvatarKeyQuery } from '../impl/find-user-by-avatar-key.query.js';

@Injectable()
@QueryHandler(FindUserByAvatarKeyQuery)
export class FindUserByAvatarKeyHandler implements IQueryHandler<
  FindUserByAvatarKeyQuery,
  User | null
> {
  constructor(private readonly prisma: PrismaService) {}

  execute(query: FindUserByAvatarKeyQuery): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { avatarKey: query.avatarKey } });
  }
}
