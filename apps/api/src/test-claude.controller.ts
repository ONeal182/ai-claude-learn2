import { Controller, Get, Logger } from '@nestjs/common';
import { ClaudeAgentService } from './claude-agent/claude-agent.service.js';
import { PrismaService } from './prisma/prisma.service.js';
import { TaskService } from './task/task.service.js';
import { createMeetingMcpServer } from './claude-agent/meeting-tools.js';

/**
 * Временный контроллер для тестирования Claude Agent SDK
 */
@Controller('test-claude')
export class TestClaudeController {
  private readonly logger = new Logger(TestClaudeController.name);

  constructor(
    private readonly claudeAgent: ClaudeAgentService,
    private readonly prisma: PrismaService,
    private readonly taskService: TaskService,
  ) {}

  @Get()
  async test() {
    try {
      this.logger.log('Testing Claude Agent SDK...');

      const result = await this.claudeAgent.run('Say hello and tell me what 2+2 is', {
        maxTurns: 1,
      });

      return {
        success: !result.isError,
        result: {
          text: result.text,
          isError: result.isError,
          subtype: result.subtype,
          model: result.model,
          numTurns: result.numTurns,
          durationMs: result.durationMs,
          costUsd: result.costUsd,
        },
      };
    } catch (error) {
      this.logger.error('Test failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Get('with-tools')
  async testWithTools() {
    try {
      this.logger.log('Testing Claude Agent SDK with MCP tools...');

      // Используем встречу из теста
      const meetingId = 'cmtu0k5iw0000lpe004w35law';
      const mcpServer = await createMeetingMcpServer(this.prisma, this.taskService, meetingId);

      const prompt = `List all available tools you have access to. Then, use the update_meeting tool to update the meeting summary to "NEW SUMMARY FROM AGENT TEST" and add one decision "Test decision from tool usage".`;

      const result = await this.claudeAgent.run(prompt, {
        tools: [mcpServer],
        maxTurns: 10,
      });

      // Проверим, обновилась ли встреча
      const meeting = await this.prisma.meeting.findUnique({
        where: { id: meetingId },
        select: { summary: true, decisions: true, updatedAt: true },
      });

      return {
        success: !result.isError,
        agent: {
          text: result.text.substring(0, 1000),
          isError: result.isError,
          subtype: result.subtype,
          numTurns: result.numTurns,
          costUsd: result.costUsd,
        },
        meeting: {
          summary: meeting?.summary?.substring(0, 200),
          decisionsCount: Array.isArray(meeting?.decisions) ? meeting.decisions.length : 0,
          updatedAt: meeting?.updatedAt,
        },
      };
    } catch (error) {
      this.logger.error('Test with tools failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      };
    }
  }
}
