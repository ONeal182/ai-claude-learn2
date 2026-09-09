import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { validateEnv } from './config/env.validation.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { MeetingModule } from './meeting/meeting.module.js';
import { MeetingFileModule } from './meeting-file/meeting-file.module.js';
import { ProfileModule } from './profile/profile.module.js';
import { ClaudeAgentModule } from './claude-agent/claude-agent.module.js';
import { TaskModule } from './task/task.module.js';
import { MeetingUpdatesModule } from './meeting-updates/meeting-updates.module.js';
import { TestClaudeController } from './test-claude.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    PrismaModule,
    UsersModule,
    AuthModule,
    MeetingModule,
    MeetingFileModule,
    ProfileModule,
    ClaudeAgentModule,
    TaskModule,
    MeetingUpdatesModule,
  ],
  controllers: [AppController, TestClaudeController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, transform: true }),
    },
  ],
})
export class AppModule {}
