import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ClaudeAgentModule } from '../claude-agent/claude-agent.module.js';
import { TaskModule } from '../task/task.module.js';
import { MeetingController } from './meeting.controller.js';
import { CommandHandlers } from './commands/handlers/index.js';
import { QueryHandlers } from './queries/handlers/index.js';
import { EventHandlers } from './events/handlers/index.js';

@Module({
  imports: [AuthModule, ClaudeAgentModule, TaskModule],
  controllers: [MeetingController],
  providers: [...CommandHandlers, ...QueryHandlers, ...EventHandlers],
})
export class MeetingModule {}
