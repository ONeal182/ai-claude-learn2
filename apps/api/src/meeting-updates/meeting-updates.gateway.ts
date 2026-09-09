import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MeetingUpdatesService } from './meeting-updates.service.js';
import { SubscribeMeetingDto } from './dto/subscribe-meeting.dto.js';

@WebSocketGateway({
  cors: {
    origin: process.env.WEB_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/meeting-updates',
})
export class MeetingUpdatesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MeetingUpdatesGateway.name);

  constructor(
    private readonly meetingUpdatesService: MeetingUpdatesService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      // Extract JWT token from auth or query
      const token = client.handshake.auth.token || client.handshake.query.token;

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      // Verify JWT token
      const jwtSecret = this.configService.get<string>('JWT_SECRET');
      const payload = await this.jwtService.verifyAsync(token as string, {
        secret: jwtSecret,
      });

      if (!payload || !payload.userId) {
        this.logger.warn(`Client ${client.id} has invalid token`);
        client.disconnect();
        return;
      }

      // Store userId in socket data
      client.data.userId = payload.userId;
      this.logger.log(`Client ${client.id} connected (user: ${payload.userId})`);
    } catch (error) {
      this.logger.error(`Authentication failed for client ${client.id}:`, error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage('subscribe:meeting')
  async handleSubscribe(
    @MessageBody() dto: SubscribeMeetingDto,
    @ConnectedSocket() client: Socket,
  ) {
    const { meetingId } = dto;
    const userId = client.data.userId;

    if (!userId) {
      return { error: 'Unauthorized' };
    }

    // Verify user has access to this meeting
    const hasAccess = await this.meetingUpdatesService.verifyAccess(userId, meetingId);
    if (!hasAccess) {
      this.logger.warn(`User ${userId} denied access to meeting ${meetingId}`);
      return { error: 'Forbidden' };
    }

    // Join room for this meeting
    await client.join(`meeting:${meetingId}`);
    this.logger.log(`Client ${client.id} subscribed to meeting ${meetingId}`);

    return { subscribed: true, meetingId };
  }

  @SubscribeMessage('unsubscribe:meeting')
  handleUnsubscribe(@MessageBody() dto: SubscribeMeetingDto, @ConnectedSocket() client: Socket) {
    const { meetingId } = dto;
    client.leave(`meeting:${meetingId}`);
    this.logger.log(`Client ${client.id} unsubscribed from meeting ${meetingId}`);

    return { unsubscribed: true, meetingId };
  }
}
