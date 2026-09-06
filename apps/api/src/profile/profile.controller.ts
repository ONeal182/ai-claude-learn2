import { Body, Controller, Get, HttpCode, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ChangePasswordCommand } from '../auth/commands/impl/change-password.command.js';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/guards/jwt-auth.guard.js';
import { UpdateUserProfileCommand } from '../users/commands/impl/update-user-profile.command.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { ProfileDto } from './dto/profile.dto.js';
import { UpdateProfileNameDto } from './dto/update-profile-name.dto.js';
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

  @Post('me/password')
  @HttpCode(200)
  async changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new ChangePasswordCommand(request.user!.userId, dto.currentPassword, dto.newPassword),
    );
  }
}
