import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClaudeAgentService } from './claude-agent.service.js';

/**
 * Wraps `@anthropic-ai/claude-agent-sdk` (loaded lazily by {@link ClaudeAgentService} —
 * not a package dependency). Provides and exports {@link ClaudeAgentService}; imports
 * `ConfigModule` so it also works standalone in tests (in the app the global
 * `ConfigModule` from `AppModule` satisfies it).
 */
@Module({
  imports: [ConfigModule],
  providers: [ClaudeAgentService],
  exports: [ClaudeAgentService],
})
export class ClaudeAgentModule {}
