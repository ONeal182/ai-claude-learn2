import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProfileController } from './profile.controller.js';
import { QueryHandlers } from './queries/handlers/index.js';

@Module({
  imports: [AuthModule],
  controllers: [ProfileController],
  providers: [...QueryHandlers],
})
export class ProfileModule {}
