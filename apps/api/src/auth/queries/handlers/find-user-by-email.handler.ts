import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { User } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { FindUserByEmailQuery } from '../impl/find-user-by-email.query.js';

@Injectable()
@QueryHandler(FindUserByEmailQuery)
export class FindUserByEmailHandler implements IQueryHandler<FindUserByEmailQuery, User | null> {
  constructor(private readonly prisma: PrismaService) {}

  execute(query: FindUserByEmailQuery): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: query.email } });
  }
}
