import { Test, TestingModule } from '@nestjs/testing';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Reflector } from '@nestjs/core';
import type { Meeting } from '@prisma/client';
import { MeetingController } from './meeting.controller.js';
import { CreateMeetingCommand } from './commands/impl/create-meeting.command.js';
import { RegenerateMeetingSummaryCommand } from './commands/impl/regenerate-meeting-summary.command.js';
import { ListMeetingsQuery } from './queries/impl/list-meetings.query.js';
import { GetMeetingByIdQuery } from './queries/impl/get-meeting-by-id.query.js';
import { CreateMeetingDto } from './dto/create-meeting.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ThrottlerGuard } from '@nestjs/throttler';

describe('MeetingController', () => {
  let controller: MeetingController;
  let commandBus: CommandBus;
  let queryBus: QueryBus;

  const mockCommandBus = {
    execute: vi.fn(),
  };

  const mockQueryBus = {
    execute: vi.fn(),
  };

  const mockMeeting: Meeting = {
    id: 'meeting-1',
    title: 'Test Meeting',
    startsAt: new Date('2024-01-01T10:00:00Z'),
    userId: 'user-1',
    summary: null,
    decisions: null,
    createdAt: new Date('2024-01-01T09:00:00Z'),
    updatedAt: new Date('2024-01-01T09:00:00Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeetingController],
      providers: [
        {
          provide: CommandBus,
          useValue: mockCommandBus,
        },
        {
          provide: QueryBus,
          useValue: mockQueryBus,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MeetingController>(MeetingController);
    commandBus = module.get<CommandBus>(CommandBus);
    queryBus = module.get<QueryBus>(QueryBus);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should dispatch CreateMeetingCommand with userId', async () => {
      const dto: CreateMeetingDto = {
        title: 'Test Meeting',
        startsAt: '2024-01-01T10:00:00Z',
      };
      const userId = 'user-1';

      mockCommandBus.execute.mockResolvedValue(mockMeeting);

      await controller.create(dto, userId);

      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          title: dto.title,
          startsAt: dto.startsAt,
          userId,
        }),
      );
      expect(commandBus.execute).toHaveBeenCalledWith(expect.any(CreateMeetingCommand));
    });

    it('should return created meeting', async () => {
      const dto: CreateMeetingDto = {
        title: 'Test Meeting',
        startsAt: '2024-01-01T10:00:00Z',
      };
      const userId = 'user-1';

      mockCommandBus.execute.mockResolvedValue(mockMeeting);

      const result = await controller.create(dto, userId);

      expect(result).toEqual(mockMeeting);
    });
  });

  describe('list', () => {
    it('should dispatch ListMeetingsQuery with userId', async () => {
      const userId = 'user-1';
      const meetings = [mockMeeting];

      mockQueryBus.execute.mockResolvedValue(meetings);

      await controller.list(userId);

      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
        }),
      );
      expect(queryBus.execute).toHaveBeenCalledWith(expect.any(ListMeetingsQuery));
    });

    it('should return meetings array', async () => {
      const userId = 'user-1';
      const meetings = [mockMeeting];

      mockQueryBus.execute.mockResolvedValue(meetings);

      const result = await controller.list(userId);

      expect(result).toEqual(meetings);
    });
  });

  describe('getById', () => {
    it('should dispatch GetMeetingByIdQuery with id and userId', async () => {
      const id = 'meeting-1';
      const userId = 'user-1';

      mockQueryBus.execute.mockResolvedValue(mockMeeting);

      await controller.getById(id, userId);

      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          id,
          userId,
        }),
      );
      expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetMeetingByIdQuery));
    });

    it('should return meeting', async () => {
      const id = 'meeting-1';
      const userId = 'user-1';

      mockQueryBus.execute.mockResolvedValue(mockMeeting);

      const result = await controller.getById(id, userId);

      expect(result).toEqual(mockMeeting);
    });
  });

  describe('regenerateSummary', () => {
    it('should dispatch RegenerateMeetingSummaryCommand with id and userId', async () => {
      const id = 'meeting-1';
      const userId = 'user-1';

      mockCommandBus.execute.mockResolvedValue(mockMeeting);

      await controller.regenerateSummary(id, userId);

      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          meetingId: id,
          userId,
        }),
      );
      expect(commandBus.execute).toHaveBeenCalledWith(expect.any(RegenerateMeetingSummaryCommand));
    });

    it('should return updated meeting', async () => {
      const id = 'meeting-1';
      const userId = 'user-1';
      const updatedMeeting = { ...mockMeeting, summary: 'New summary' };

      mockCommandBus.execute.mockResolvedValue(updatedMeeting);

      const result = await controller.regenerateSummary(id, userId);

      expect(result).toEqual(updatedMeeting);
    });

    it('should have correct HTTP status (200 OK)', () => {
      const reflector = new Reflector();
      const httpCode = reflector.get('__httpCode__', controller.regenerateSummary);

      expect(httpCode).toBe(200);
    });
  });

  describe('Guards', () => {
    it('should have JwtAuthGuard applied to controller', () => {
      const reflector = new Reflector();
      const guards = reflector.get('__guards__', MeetingController);

      expect(guards).toBeDefined();
      expect(guards).toContain(JwtAuthGuard);
    });

    it('should have ThrottlerGuard applied to regenerateSummary', () => {
      const reflector = new Reflector();
      const guards = reflector.get('__guards__', controller.regenerateSummary);

      expect(guards).toBeDefined();
      expect(guards).toContain(ThrottlerGuard);
    });
  });
});
