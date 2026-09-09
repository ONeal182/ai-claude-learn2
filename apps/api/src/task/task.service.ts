import { Injectable } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export interface UpsertTaskDto {
  id?: string;
  title: string;
  sourceMeetingId: string;
  status?: TaskStatus;
}

@Injectable()
export class TaskService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Поиск задач по тексту (в title)
   */
  async search(query: string, meetingId?: string) {
    return this.prisma.task.findMany({
      where: {
        title: {
          contains: query,
          mode: 'insensitive',
        },
        ...(meetingId && { sourceMeetingId: meetingId }),
      },
      include: {
        sourceMeeting: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Создание или обновление задачи
   * Если передан id - обновляет, иначе создаёт новую
   */
  async upsert(dto: UpsertTaskDto) {
    const { id, ...data } = dto;

    if (id) {
      // Обновление существующей задачи
      return this.prisma.task.update({
        where: { id },
        data,
        include: {
          sourceMeeting: true,
        },
      });
    }

    // Создание новой задачи
    return this.prisma.task.create({
      data,
      include: {
        sourceMeeting: true,
      },
    });
  }
}
