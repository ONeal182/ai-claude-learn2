import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { TaskService } from '../task/task.service.js';
import {
  findTasksTool,
  upsertTaskTool,
  updateMeetingTool,
  createMeetingMcpServer,
} from './meeting-tools.js';

describe('meeting-tools', () => {
  let mockPrisma: PrismaService;
  let mockTaskService: TaskService;
  const testMeetingId = 'meeting-123';

  beforeEach(() => {
    // Mock PrismaService
    mockPrisma = {
      meeting: {
        update: vi.fn(),
      },
      task: {
        findUnique: vi.fn(),
      },
    } as any;

    // Mock TaskService
    mockTaskService = {
      search: vi.fn(),
      upsert: vi.fn(),
    } as any;
  });

  describe('findTasksTool', () => {
    it('should have correct schema and metadata', () => {
      expect(findTasksTool.name).toBe('find_tasks');
      expect(findTasksTool.readOnlyHint).toBe(true);
      expect(findTasksTool.description).toBeTruthy();

      // Validate input schema
      const validInput = { query: 'test' };
      expect(() => findTasksTool.inputSchema.parse(validInput)).not.toThrow();
    });

    it('should search tasks and return in correct MCP format', async () => {
      const mockTasks = [
        { id: '1', title: 'Task 1', status: 'pending', sourceMeetingId: testMeetingId },
        { id: '2', title: 'Task 2', status: 'completed', sourceMeetingId: testMeetingId },
      ];
      vi.mocked(mockTaskService.search).mockResolvedValue(mockTasks);

      const result = await findTasksTool.handler(
        { query: 'Task' },
        { taskService: mockTaskService },
      );

      expect(mockTaskService.search).toHaveBeenCalledWith('Task');
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify(mockTasks, null, 2),
          },
        ],
      });
    });

    it('should handle empty search results', async () => {
      vi.mocked(mockTaskService.search).mockResolvedValue([]);

      const result = await findTasksTool.handler(
        { query: 'nonexistent' },
        { taskService: mockTaskService },
      );

      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify([], null, 2),
          },
        ],
      });
    });
  });

  describe('upsertTaskTool', () => {
    it('should have correct schema and metadata', () => {
      expect(upsertTaskTool.name).toBe('upsert_task');
      expect(upsertTaskTool.description).toBeTruthy();

      // Validate input schema
      const validInput = {
        title: 'New Task',
        status: 'pending',
        sourceMeetingId: testMeetingId,
      };
      expect(() => upsertTaskTool.inputSchema.parse(validInput)).not.toThrow();
    });

    it('should create new task with correct meetingId', async () => {
      const newTask = {
        id: '1',
        title: 'New Task',
        status: 'pending',
        sourceMeetingId: testMeetingId,
      };
      vi.mocked(mockTaskService.upsert).mockResolvedValue(newTask);

      const result = await upsertTaskTool.handler(
        {
          title: 'New Task',
          status: 'pending',
          sourceMeetingId: testMeetingId,
        },
        { taskService: mockTaskService },
      );

      expect(mockTaskService.upsert).toHaveBeenCalledWith({
        id: undefined,
        title: 'New Task',
        sourceMeetingId: testMeetingId,
        status: 'pending',
      });
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify(newTask, null, 2),
          },
        ],
      });
    });

    it('should update existing task', async () => {
      const updatedTask = {
        id: 'task-1',
        title: 'Updated Task',
        status: 'completed',
        sourceMeetingId: testMeetingId,
      };
      vi.mocked(mockTaskService.upsert).mockResolvedValue(updatedTask);

      const result = await upsertTaskTool.handler(
        {
          id: 'task-1',
          title: 'Updated Task',
          status: 'completed',
          sourceMeetingId: testMeetingId,
        },
        { taskService: mockTaskService },
      );

      expect(mockTaskService.upsert).toHaveBeenCalledWith({
        id: 'task-1',
        title: 'Updated Task',
        sourceMeetingId: testMeetingId,
        status: 'completed',
      });
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify(updatedTask, null, 2),
          },
        ],
      });
    });

    it('should validate status enum', () => {
      const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
      validStatuses.forEach((status) => {
        expect(() =>
          upsertTaskTool.inputSchema.parse({
            title: 'Task',
            status,
            sourceMeetingId: testMeetingId,
          }),
        ).not.toThrow();
      });

      expect(() =>
        upsertTaskTool.inputSchema.parse({
          title: 'Task',
          status: 'invalid',
          sourceMeetingId: testMeetingId,
        }),
      ).toThrow();
    });
  });

  describe('updateMeetingTool', () => {
    it('should have correct schema and metadata', () => {
      expect(updateMeetingTool.name).toBe('update_meeting');
      expect(updateMeetingTool.description).toBeTruthy();

      // Validate input schema
      const validInput = {
        meetingId: testMeetingId,
        summary: 'Summary',
        decisions: ['Decision 1'],
      };
      expect(() => updateMeetingTool.inputSchema.parse(validInput)).not.toThrow();
    });

    it('should update meeting summary', async () => {
      const updatedMeeting = {
        id: testMeetingId,
        summary: 'New summary',
        decisions: null,
        createdAt: new Date(),
      };
      vi.mocked(mockPrisma.meeting.update).mockResolvedValue(updatedMeeting);

      const result = await updateMeetingTool.handler(
        {
          meetingId: testMeetingId,
          summary: 'New summary',
        },
        { prisma: mockPrisma },
      );

      expect(mockPrisma.meeting.update).toHaveBeenCalledWith({
        where: { id: testMeetingId },
        data: {
          summary: 'New summary',
          decisions: undefined,
        },
      });
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify(updatedMeeting, null, 2),
          },
        ],
      });
    });

    it('should update meeting decisions', async () => {
      const updatedMeeting = {
        id: testMeetingId,
        summary: null,
        decisions: ['Decision 1', 'Decision 2'],
        createdAt: new Date(),
      };
      vi.mocked(mockPrisma.meeting.update).mockResolvedValue(updatedMeeting);

      const result = await updateMeetingTool.handler(
        {
          meetingId: testMeetingId,
          decisions: ['Decision 1', 'Decision 2'],
        },
        { prisma: mockPrisma },
      );

      expect(mockPrisma.meeting.update).toHaveBeenCalledWith({
        where: { id: testMeetingId },
        data: {
          summary: undefined,
          decisions: ['Decision 1', 'Decision 2'],
        },
      });
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify(updatedMeeting, null, 2),
          },
        ],
      });
    });

    it('should handle optional fields (summary and decisions can be undefined)', async () => {
      const updatedMeeting = {
        id: testMeetingId,
        summary: null,
        decisions: null,
        createdAt: new Date(),
      };
      vi.mocked(mockPrisma.meeting.update).mockResolvedValue(updatedMeeting);

      const result = await updateMeetingTool.handler(
        {
          meetingId: testMeetingId,
        },
        { prisma: mockPrisma },
      );

      expect(mockPrisma.meeting.update).toHaveBeenCalledWith({
        where: { id: testMeetingId },
        data: {
          summary: undefined,
          decisions: undefined,
        },
      });
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify(updatedMeeting, null, 2),
          },
        ],
      });
    });

    it('should return meeting in correct MCP format', async () => {
      const meeting = {
        id: testMeetingId,
        summary: 'Test summary',
        decisions: ['Decision'],
        createdAt: new Date(),
      };
      vi.mocked(mockPrisma.meeting.update).mockResolvedValue(meeting);

      const result = await updateMeetingTool.handler(
        {
          meetingId: testMeetingId,
          summary: 'Test summary',
          decisions: ['Decision'],
        },
        { prisma: mockPrisma },
      );

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });

  describe('createMeetingMcpServer', () => {
    beforeEach(() => {
      // Mock the @anthropic-ai/claude-agent-sdk module
      vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
        createSdkMcpServer: vi.fn((config) => ({
          name: config.name,
          tools: config.tools,
        })),
      }));
    });

    it('should create server with scoped tools', async () => {
      const server = await createMeetingMcpServer(mockPrisma, mockTaskService, testMeetingId);

      expect(server).toHaveProperty('name', 'meeting');
      expect(server).toHaveProperty('tools');
      expect(Array.isArray(server.tools)).toBe(true);
      expect(server.tools).toHaveLength(3);
    });

    it('should bind meetingId to find_tasks operation', async () => {
      const mockTasks = [{ id: '1', title: 'Task 1', sourceMeetingId: testMeetingId }];
      vi.mocked(mockTaskService.search).mockResolvedValue(mockTasks);

      const server = await createMeetingMcpServer(mockPrisma, mockTaskService, testMeetingId);
      const findTasksTool = server.tools.find((t: any) => t.name === 'find_tasks');

      await findTasksTool.handler({ query: 'test' });

      // Should call search with meetingId
      expect(mockTaskService.search).toHaveBeenCalledWith('test', testMeetingId);
    });

    it('should bind meetingId to upsert_task operation', async () => {
      const newTask = {
        id: '1',
        title: 'New Task',
        status: 'pending',
        sourceMeetingId: testMeetingId,
      };
      vi.mocked(mockTaskService.upsert).mockResolvedValue(newTask);

      const server = await createMeetingMcpServer(mockPrisma, mockTaskService, testMeetingId);
      const upsertTaskTool = server.tools.find((t: any) => t.name === 'upsert_task');

      await upsertTaskTool.handler({ title: 'New Task' });

      // Should call upsert with scoped meetingId
      expect(mockTaskService.upsert).toHaveBeenCalledWith({
        id: undefined,
        title: 'New Task',
        sourceMeetingId: testMeetingId,
        status: undefined,
      });
    });

    it('should throw error when updating task from different meeting', async () => {
      const differentMeetingId = 'meeting-456';
      vi.mocked(mockPrisma.task.findUnique).mockResolvedValue({
        id: 'task-1',
        sourceMeetingId: differentMeetingId,
      } as any);

      const server = await createMeetingMcpServer(mockPrisma, mockTaskService, testMeetingId);
      const upsertTaskTool = server.tools.find((t: any) => t.name === 'upsert_task');

      await expect(upsertTaskTool.handler({ id: 'task-1', title: 'Updated Task' })).rejects.toThrow(
        'does not belong to the current meeting',
      );

      expect(mockTaskService.upsert).not.toHaveBeenCalled();
    });

    it('should throw error when task not found', async () => {
      vi.mocked(mockPrisma.task.findUnique).mockResolvedValue(null);

      const server = await createMeetingMcpServer(mockPrisma, mockTaskService, testMeetingId);
      const upsertTaskTool = server.tools.find((t: any) => t.name === 'upsert_task');

      await expect(
        upsertTaskTool.handler({ id: 'nonexistent', title: 'Updated Task' }),
      ).rejects.toThrow('does not exist');

      expect(mockTaskService.upsert).not.toHaveBeenCalled();
    });

    it('should bind meetingId to update_meeting operation', async () => {
      const updatedMeeting = {
        id: testMeetingId,
        summary: 'Summary',
        decisions: ['Decision'],
        createdAt: new Date(),
      };
      vi.mocked(mockPrisma.meeting.update).mockResolvedValue(updatedMeeting);

      const server = await createMeetingMcpServer(mockPrisma, mockTaskService, testMeetingId);
      const updateMeetingTool = server.tools.find((t: any) => t.name === 'update_meeting');

      // Note: scoped version doesn't require meetingId in input
      await updateMeetingTool.handler({ summary: 'Summary', decisions: ['Decision'] });

      // Should call update with scoped meetingId
      expect(mockPrisma.meeting.update).toHaveBeenCalledWith({
        where: { id: testMeetingId },
        data: {
          summary: 'Summary',
          decisions: ['Decision'],
        },
      });
    });

    it('should have updated descriptions for scoped tools', async () => {
      const server = await createMeetingMcpServer(mockPrisma, mockTaskService, testMeetingId);

      const findTool = server.tools.find((t: any) => t.name === 'find_tasks');
      expect(findTool.description).toContain('current meeting');

      const upsertTool = server.tools.find((t: any) => t.name === 'upsert_task');
      expect(upsertTool.description).toContain('current meeting');

      const updateTool = server.tools.find((t: any) => t.name === 'update_meeting');
      expect(updateTool.description).toContain('current meeting');
    });

    it('should remove sourceMeetingId from upsert_task input schema', async () => {
      const server = await createMeetingMcpServer(mockPrisma, mockTaskService, testMeetingId);
      const upsertTool = server.tools.find((t: any) => t.name === 'upsert_task');

      // Schema should not include sourceMeetingId
      expect(() =>
        upsertTool.inputSchema.parse({
          title: 'Task',
          status: 'pending',
        }),
      ).not.toThrow();

      // Zod strips extra fields not in schema
      const parsed = upsertTool.inputSchema.parse({
        title: 'Task',
        sourceMeetingId: 'should-be-stripped',
      });
      expect(parsed).toHaveProperty('title', 'Task');
      expect(parsed).not.toHaveProperty('sourceMeetingId'); // Zod strips it

      // Handler always uses the scoped meetingId
      const newTask = {
        id: '1',
        title: 'Task',
        status: 'pending',
        sourceMeetingId: testMeetingId,
      };
      vi.mocked(mockTaskService.upsert).mockResolvedValue(newTask);

      await upsertTool.handler({ title: 'Task' });

      expect(mockTaskService.upsert).toHaveBeenCalledWith({
        id: undefined,
        title: 'Task',
        sourceMeetingId: testMeetingId, // Always uses scoped ID
        status: undefined,
      });
    });

    it('should remove meetingId from update_meeting input schema', async () => {
      const server = await createMeetingMcpServer(mockPrisma, mockTaskService, testMeetingId);
      const updateTool = server.tools.find((t: any) => t.name === 'update_meeting');

      // Schema should not include meetingId
      expect(() =>
        updateTool.inputSchema.parse({
          summary: 'Summary',
        }),
      ).not.toThrow();

      // Zod strips extra fields not in schema
      const parsed = updateTool.inputSchema.parse({
        meetingId: 'should-be-stripped',
        summary: 'Summary',
      });
      expect(parsed).toHaveProperty('summary', 'Summary');
      expect(parsed).not.toHaveProperty('meetingId'); // Zod strips it

      // Handler always uses the scoped meetingId
      const updatedMeeting = {
        id: testMeetingId,
        summary: 'Summary',
        decisions: null,
        createdAt: new Date(),
      };
      vi.mocked(mockPrisma.meeting.update).mockResolvedValue(updatedMeeting);

      await updateTool.handler({ summary: 'Summary' });

      expect(mockPrisma.meeting.update).toHaveBeenCalledWith({
        where: { id: testMeetingId }, // Always uses scoped ID
        data: {
          summary: 'Summary',
          decisions: undefined,
        },
      });
    });

    it('should throw error when SDK is not installed', async () => {
      vi.doUnmock('@anthropic-ai/claude-agent-sdk');
      vi.doMock('@anthropic-ai/claude-agent-sdk', () => {
        throw new Error('Cannot find module');
      });

      await expect(
        createMeetingMcpServer(mockPrisma, mockTaskService, testMeetingId),
      ).rejects.toThrow('@anthropic-ai/claude-agent-sdk is not installed');
    });
  });
});
