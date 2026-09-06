import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/guards/jwt-auth.guard.js';
import { UpdateUserProfileCommand } from '../users/commands/impl/update-user-profile.command.js';
import { UploadAvatarCommand } from './commands/impl/upload-avatar.command.js';
import { ProfileDto } from './dto/profile.dto.js';
import { UpdateProfileNameDto } from './dto/update-profile-name.dto.js';
import type { UploadedAvatarPart } from './dto/uploaded-avatar-part.js';
import { GetProfileQuery } from './queries/impl/get-profile.query.js';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('me')
  getMe(@Req() request: AuthenticatedRequest): Promise<ProfileDto> {
    return this.queryBus.execute(new GetProfileQuery(request.user!.userId));
  }

  @Patch('me')
  async updateMe(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateProfileNameDto,
  ): Promise<ProfileDto> {
    const userId = request.user!.userId;
    await this.commandBus.execute(new UpdateUserProfileCommand(userId, dto.name));
    return this.queryBus.execute(new GetProfileQuery(userId));
  }

  @Put('me/avatar')
  @UseInterceptors(FileInterceptor('file'))
  updateAvatar(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file: UploadedAvatarPart | undefined,
  ): Promise<ProfileDto> {
    // 413 (лимит) и 400 (mime не image) отсекает MulterModule до сюда; здесь — только «файла нет»
    if (!file) {
      throw new BadRequestException('Файл обязателен (поле «file»)');
    }
    return this.commandBus.execute(
      new UploadAvatarCommand(request.user!.userId, {
        mimetype: file.mimetype,
        buffer: file.buffer,
      }),
    );
  }
}
