import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import type { AvatarContent } from './dto/avatar-content.js';
import { GetAvatarContentQuery } from './queries/impl/get-avatar-content.query.js';

/**
 * Публичная отдача аватара — **без** `JwtAuthGuard`: ключ (`<uuid>.<ext>`) неугадываем.
 * `Content-Type` восстанавливается из расширения ключа; содержимое дополнительно провалидировано
 * по magic bytes при загрузке (см. `UploadAvatarHandler`).
 * `nosniff` + запретительный CSP — на случай, если в хранилище всё же попадёт не-картинка:
 * браузер не должен интерпретировать ответ как HTML/скрипт.
 * 404 — если нет пользователя с таким `avatarKey` либо бинарника нет на диске (в query-хендлере).
 */
@Controller('users/avatars')
export class AvatarController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get(':key')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  @Header('Cache-Control', 'private, max-age=0, must-revalidate')
  async serve(@Param('key') key: string): Promise<StreamableFile> {
    const { stream, mimeType }: AvatarContent = await this.queryBus.execute(
      new GetAvatarContentQuery(key),
    );
    return new StreamableFile(stream, { type: mimeType });
  }
}
