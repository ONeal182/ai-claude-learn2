import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { RateLimit } from '../common/rate-limit.guard.js';
import { RegisterCommand } from './commands/impl/register.command.js';
import { LoginCommand } from './commands/impl/login.command.js';
import type { AuthResult } from './services/auth-token.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';

/**
 * `@RateLimit` защищает от онлайн-перебора паролей и массовой регистрации:
 * лимит на IP в скользящем окне (дефолт 10 / 60 c), переопределяется env
 * `RATE_LIMIT_AUTH_LIMIT` / `RATE_LIMIT_AUTH_WINDOW_MS` (0 — выключить).
 */
@Controller('auth')
@RateLimit({ name: 'auth', limit: 10, windowMs: 60_000 })
export class AuthController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('register')
  register(@Body() dto: RegisterDto): Promise<AuthResult> {
    return this.commandBus.execute(new RegisterCommand(dto.email, dto.password));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<AuthResult> {
    return this.commandBus.execute(new LoginCommand(dto.email, dto.password));
  }
}
