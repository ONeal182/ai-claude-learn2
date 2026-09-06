import { BadRequestException, Injectable } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import type { User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { FileStorageService } from '../../../storage/file-storage.service.js';
import { UpdateUserAvatarCommand } from '../../../users/commands/impl/update-user-avatar.command.js';
import { FindUserByIdQuery } from '../../../users/queries/impl/find-user-by-id.query.js';
import { AVATAR_MIME_TO_EXT } from '../../avatar-mime.js';
import { toProfileDto, type ProfileDto } from '../../dto/profile.dto.js';
import { UploadAvatarCommand } from '../impl/upload-avatar.command.js';

@Injectable()
@CommandHandler(UploadAvatarCommand)
export class UploadAvatarHandler implements ICommandHandler<UploadAvatarCommand, ProfileDto> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly storage: FileStorageService,
  ) {}

  async execute(command: UploadAvatarCommand): Promise<ProfileDto> {
    const ext = AVATAR_MIME_TO_EXT.get(command.file.mimetype);
    if (!ext) {
      // подстраховка — не-image отсекает уже `fileFilter` multer'а (400)
      throw new BadRequestException(`Недопустимый тип файла: ${command.file.mimetype}`);
    }

    // прежний ключ — чтобы стереть старый бинарник после успешной замены
    const current = await this.queryBus.execute<FindUserByIdQuery, User | null>(
      new FindUserByIdQuery(command.userId),
    );

    // ключ = случайный uuid + расширение (mime восстанавливается из него при отдаче)
    const avatarKey = `${randomUUID()}.${ext}`;
    await this.storage.save(avatarKey, command.file.buffer);

    try {
      const user = await this.commandBus.execute<UpdateUserAvatarCommand, User>(
        new UpdateUserAvatarCommand(command.userId, avatarKey),
      );

      // старый файл убираем только после того, как новый ключ закреплён в БД
      if (current?.avatarKey && current.avatarKey !== avatarKey) {
        await this.storage.remove(current.avatarKey).catch(() => undefined);
      }

      return toProfileDto(user);
    } catch (error) {
      // на диске не должно оставаться «сирот», если обновление не удалось
      await this.storage.remove(avatarKey).catch(() => undefined);
      throw error;
    }
  }
}
