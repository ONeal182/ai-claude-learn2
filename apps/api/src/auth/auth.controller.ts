import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { RegisterCommand } from './commands/impl/register.command.js';
import { LoginCommand } from './commands/impl/login.command.js';
import type { AuthResult } from './services/auth-token.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';

@Controller('auth')
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
