import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export interface AuthUser {
  userId: string;
  email: string;
}

export type AuthenticatedRequest = Request & { user?: AuthUser };

interface JwtPayload {
  sub: string;
  email: string;
}

/**
 * Пропускает запрос только с валидным `Authorization: Bearer <JWT>`.
 * Токен выпускает auth-модуль (POST /auth/register|login), секрет — общий JwtModule.
 * При успехе кладёт `{ userId, email }` в `request.user`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      request.user = { userId: payload.sub, email: payload.email };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractToken(request: AuthenticatedRequest): string | undefined {
    const [scheme, value] = request.headers.authorization?.split(' ') ?? [];
    return scheme === 'Bearer' && value ? value : undefined;
  }
}
