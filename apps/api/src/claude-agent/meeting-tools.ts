import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import { TaskService } from '../task/task.service.js';

/**
 * MCP tools for Claude Agent SDK — wraps existing Prisma services into agent tools.
 * - find_tasks(query) — read-only (readOnlyHint), searches tasks via TaskService.search
 * - upsert_task(title, status, sourceMeetingId) — creates or updates a task
 * - update_meeting(meetingId, summary, decisions) — writes summary and decisions to Meeting
 *
 * Register via createMeetingMcpServer(prisma, taskService) in ClaudeAgentService.
 */

/** Lazy-load createSdkMcpServer from @anthropic-ai/claude-agent-sdk */
async function loadCreateSdkMcpServer() {
  try {
    const sdk = (await import('@anthropic-ai/claude-agent-sdk')) as {
      createSdkMcpServer: (config: { name: string; tools: any[] }) => any;
    };
    return sdk.createSdkMcpServer;
  } catch {
    throw new Error('@anthropic-ai/claude-agent-sdk is not installed — cannot create MCP server');
  }
}

/** Tool: find_tasks — search tasks by query text */
export const findTasksTool = {
  name: 'find_tasks',
  description: 'Search for tasks by text in title (case-insensitive)',
  readOnlyHint: true,
  inputSchema: z.object({
    query: z.string().describe('Search query to match against task titles'),
  }),
  async handler({ query }: { query: string }, { taskService }: { taskService: TaskService }) {
    const tasks = await taskService.search(query);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(tasks, null, 2),
        },
      ],
    };
  },
};

/** Tool: upsert_task — create or update a task */
export const upsertTaskTool = {
  name: 'upsert_task',
  description: 'Create a new task or update an existing one',
  inputSchema: z.object({
    title: z.string().min(1).describe('Task title'),
    status: z
      .enum(['pending', 'in_progress', 'completed', 'cancelled'])
      .optional()
      .describe('Task status (default: pending)'),
    sourceMeetingId: z.string().describe('ID of the source meeting'),
    id: z.string().optional().describe('Task ID to update (omit to create new)'),
  }),
  async handler(
    input: { title: string; status?: string; sourceMeetingId: string; id?: string },
    { taskService }: { taskService: TaskService },
  ) {
    const task = await taskService.upsert({
      id: input.id,
      title: input.title,
      sourceMeetingId: input.sourceMeetingId,
      status: input.status as any,
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(task, null, 2),
        },
      ],
    };
  },
};

/** Tool: update_meeting — write summary and decisions to a meeting */
export const updateMeetingTool = {
  name: 'update_meeting',
  description: 'Update meeting with summary and decisions',
  inputSchema: z.object({
    meetingId: z.string().describe('Meeting ID'),
    summary: z.string().optional().describe('Meeting summary text'),
    decisions: z.array(z.string()).optional().describe('List of decisions made'),
  }),
  async handler(
    input: { meetingId: string; summary?: string; decisions?: string[] },
    { prisma }: { prisma: PrismaService },
  ) {
    const meeting = await prisma.meeting.update({
      where: { id: input.meetingId },
      data: {
        summary: input.summary,
        decisions: input.decisions,
      },
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(meeting, null, 2),
        },
      ],
    };
  },
};

/**
 * All meeting-related tools for registration with createSdkMcpServer.
 */
export const meetingTools = [findTasksTool, upsertTaskTool, updateMeetingTool];

/**
 * Create an MCP server with meeting-related tools bound to the given services and meeting.
 * All operations are scoped to the specified meetingId.
 * Use this in ClaudeAgentService.run() by passing the server to options.tools.
 */
export async function createMeetingMcpServer(
  prisma: PrismaService,
  taskService: TaskService,
  meetingId: string,
) {
  const createSdkMcpServer = await loadCreateSdkMcpServer();

  // Bind services to tool handlers with meetingId scope
  const scopedTools = [
    {
      ...findTasksTool,
      description: 'Search for tasks of the current meeting by text in title (case-insensitive)',
      async handler(input: { query: string }) {
        // Only search tasks for this meeting
        const tasks = await taskService.search(input.query, meetingId);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(tasks, null, 2),
            },
          ],
        };
      },
    },
    {
      ...upsertTaskTool,
      description: 'Create a new task or update an existing one for the current meeting',
      inputSchema: z.object({
        title: z.string().min(1).describe('Task title'),
        status: z
          .enum(['pending', 'in_progress', 'completed', 'cancelled'])
          .optional()
          .describe('Task status (default: pending)'),
        id: z.string().optional().describe('Task ID to update (omit to create new)'),
      }),
      async handler(input: { title: string; status?: string; id?: string }) {
        // Защита от prompt injection: если передан id, проверяем что задача принадлежит текущей встрече
        if (input.id) {
          const existingTask = await prisma.task.findUnique({
            where: { id: input.id },
            select: { sourceMeetingId: true },
          });

          // Если задача не найдена или принадлежит другой встрече - блокируем операцию
          if (!existingTask || existingTask.sourceMeetingId !== meetingId) {
            throw new Error(
              `Task ${input.id} does not exist or does not belong to the current meeting`,
            );
          }
        }

        // Always use the scoped meetingId
        const task = await taskService.upsert({
          id: input.id,
          title: input.title,
          sourceMeetingId: meetingId,
          status: input.status as any,
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(task, null, 2),
            },
          ],
        };
      },
    },
    {
      ...updateMeetingTool,
      description: 'Update the current meeting with summary and decisions',
      inputSchema: z.object({
        summary: z.string().optional().describe('Meeting summary text'),
        decisions: z.array(z.string()).optional().describe('List of decisions made'),
      }),
      async handler(input: { summary?: string; decisions?: string[] }) {
        // Always update the scoped meeting
        const meeting = await prisma.meeting.update({
          where: { id: meetingId },
          data: {
            summary: input.summary,
            decisions: input.decisions,
          },
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(meeting, null, 2),
            },
          ],
        };
      },
    },
  ];

  return createSdkMcpServer({
    name: 'meeting',
    tools: scopedTools,
  });
}
