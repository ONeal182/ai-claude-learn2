import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ProfileController } from './profile.controller.js';
import { QueryHandlers } from './queries/handlers/index.js';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [ProfileController],
  providers: [...QueryHandlers],
})
export class ProfileModule {}
