import { Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs';
import type { User } from '@prisma/client';
import { FileStorageService } from '../../../storage/file-storage.service.js';
import { FindUserByAvatarKeyQuery } from '../../../users/queries/impl/find-user-by-avatar-key.query.js';
import { AVATAR_EXT_TO_MIME } from '../../avatar-mime.js';
import type { AvatarContent } from '../../dto/avatar-content.js';
import { GetAvatarContentQuery } from '../impl/get-avatar-content.query.js';

@Injectable()
@QueryHandler(GetAvatarContentQuery)
export class GetAvatarContentHandler implements IQueryHandler<
  GetAvatarContentQuery,
  AvatarContent
> {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly storage: FileStorageService,
  ) {}

  async execute(query: GetAvatarContentQuery): Promise<AvatarContent> {
    // mime восстанавливаем из расширения ключа; неизвестное расширение = неизвестный ключ
    const ext = query.key.split('.').pop();
    const mimeType = ext ? AVATAR_EXT_TO_MIME.get(ext) : undefined;
    if (!mimeType) {
      throw new NotFoundException(`Аватар ${query.key} не найден`);
    }

    // нет пользователя с таким avatarKey — ключ неизвестен (или уже заменён)
    const user = await this.queryBus.execute<FindUserByAvatarKeyQuery, User | null>(
      new FindUserByAvatarKeyQuery(query.key),
    );
    if (!user) {
      throw new NotFoundException(`Аватар ${query.key} не найден`);
    }

    // запись есть, а бинарник на диске пропал — это 404, а не 500 от упавшего потока
    if (!(await this.storage.exists(query.key))) {
      throw new NotFoundException(`Аватар ${query.key} не найден`);
    }

    return { stream: this.storage.createReadStream(query.key), mimeType };
  }
}
