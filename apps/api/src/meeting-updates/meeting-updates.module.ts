import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MeetingUpdatesGateway } from './meeting-updates.gateway.js';
import { MeetingUpdatesService } from './meeting-updates.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  providers: [
    MeetingUpdatesGateway,
    MeetingUpdatesService,
    {
      provide: 'GATEWAY_INIT',
      useFactory: (gateway: MeetingUpdatesGateway, service: MeetingUpdatesService) => {
        service.setGateway(gateway);
        return true;
      },
      inject: [MeetingUpdatesGateway, MeetingUpdatesService],
    },
  ],
  exports: [MeetingUpdatesService],
})
export class MeetingUpdatesModule {}
