import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service.js';
import { MeetingStatusChangedEvent } from './events/meeting-status-changed.event.js';
import type { MeetingUpdateDto } from './dto/meeting-update.dto.js';
import type { MeetingUpdatesGateway } from './meeting-updates.gateway.js';

@Injectable()
export class MeetingUpdatesService {
  private readonly logger = new Logger(MeetingUpdatesService.name);
  private gateway: MeetingUpdatesGateway;

  constructor(private readonly prisma: PrismaService) {}

  // Called by gateway to inject itself (circular dependency workaround)
  setGateway(gateway: MeetingUpdatesGateway) {
    this.gateway = gateway;
  }

  async verifyAccess(userId: string, meetingId: string): Promise<boolean> {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, userId },
    });
    return !!meeting;
  }

  @OnEvent('meeting.status.changed')
  async handleMeetingStatusChanged(event: MeetingStatusChangedEvent) {
    if (!this.gateway?.server) {
      this.logger.warn('Gateway not initialized, skipping broadcast');
      return;
    }

    const { meetingId, summaryStatus, summary, decisions } = event;

    const payload: MeetingUpdateDto = {
      type: 'summary_status_changed',
      meetingId,
      summaryStatus,
      summary: summaryStatus === 'done' ? summary : null,
      decisions: summaryStatus === 'done' ? decisions : null,
      timestamp: new Date().toISOString(),
    };

    this.logger.log(`Broadcasting status change for meeting ${meetingId}: ${summaryStatus}`);

    this.gateway.server.to(`meeting:${meetingId}`).emit('meeting:update', payload);
  }
}
