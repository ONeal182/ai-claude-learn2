import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';

export interface AuthResult {
  accessToken: string;
}

/**
 * Общий для команд Register/Login шаг: выпуск JWT.
 * Не имеет отношения к CQRS-инфраструктуре — обычный сервис, инжектится в командные хендлеры.
 */
@Injectable()
export class AuthTokenService {
  constructor(private readonly jwtService: JwtService) {}

  issue(user: Pick<User, 'id' | 'email'>): AuthResult {
    const payload = { sub: user.id, email: user.email };
    return { accessToken: this.jwtService.sign(payload) };
  }
}
