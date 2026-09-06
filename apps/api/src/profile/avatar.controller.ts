import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import type { AvatarContent } from './dto/avatar-content.js';
import { GetAvatarContentQuery } from './queries/impl/get-avatar-content.query.js';

/**
 * Публичная отдача аватара — **без** `JwtAuthGuard`: ключ (`<uuid>.<ext>`) неугадываем,
 * этого достаточно. `Content-Type` восстанавливается из расширения ключа.
 * 404 — если нет пользователя с таким `avatarKey` либо бинарника нет на диске (в query-хендлере).
 */
@Controller('users/avatars')
export class AvatarController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get(':key')
  async serve(@Param('key') key: string): Promise<StreamableFile> {
    const { stream, mimeType }: AvatarContent = await this.queryBus.execute(
      new GetAvatarContentQuery(key),
    );
    return new StreamableFile(stream, { type: mimeType });
  }
}
