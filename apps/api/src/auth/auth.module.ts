import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthTokenService } from './services/auth-token.service.js';
import { CommandHandlers } from './commands/handlers/index.js';
import { QueryHandlers } from './queries/handlers/index.js';
import { EventHandlers } from './events/handlers/index.js';

@Module({
  imports: [
    CqrsModule.forRoot(),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN', '1d') as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthTokenService, ...CommandHandlers, ...QueryHandlers, ...EventHandlers],
})
export class AuthModule {}
