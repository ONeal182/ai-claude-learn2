import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { User } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { FindUserByIdQuery } from '../impl/find-user-by-id.query.js';

@Injectable()
@QueryHandler(FindUserByIdQuery)
export class FindUserByIdHandler implements IQueryHandler<FindUserByIdQuery, User | null> {
  constructor(private readonly prisma: PrismaService) {}

  execute(query: FindUserByIdQuery): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id: query.userId } });
  }
}
