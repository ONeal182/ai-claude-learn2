import { Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs';
import type { User } from '@prisma/client';
import { FindUserByIdQuery } from '../../../users/queries/impl/find-user-by-id.query.js';
import { toProfileDto, type ProfileDto } from '../../dto/profile.dto.js';
import { GetProfileQuery } from '../impl/get-profile.query.js';

@Injectable()
@QueryHandler(GetProfileQuery)
export class GetProfileHandler implements IQueryHandler<GetProfileQuery, ProfileDto> {
  constructor(private readonly queryBus: QueryBus) {}

  async execute(query: GetProfileQuery): Promise<ProfileDto> {
    const user = await this.queryBus.execute<FindUserByIdQuery, User | null>(
      new FindUserByIdQuery(query.userId),
    );
    if (!user) {
      throw new NotFoundException(`User ${query.userId} not found`);
    }
    return toProfileDto(user);
  }
}
