import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

export interface RateLimitOptions {
  /** Bucket name — enables env overrides `RATE_LIMIT_<NAME>_LIMIT` / `_WINDOW_MS`. */
  name: string;
  /** Max requests per window per client (before the env override, if any). */
  limit: number;
  /** Sliding window length in ms (before the env override, if any). */
  windowMs: number;
}

export const RATE_LIMIT_KEY = 'rate-limit-options';

/**
 * Marks a route (or controller) as rate-limited. Enforced by the global
 * {@link RateLimitGuard}; routes without this metadata are not throttled.
 */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

/**
 * Lightweight in-process sliding-window rate limiter — no external store.
 * Adequate for a single API instance (brute-force / abuse protection on auth
 * endpoints); a multi-instance deployment needs a shared store instead.
 *
 * Applied globally via `APP_GUARD`; acts only on handlers carrying `@RateLimit()`.
 * Runs after `JwtAuthGuard` where both are present, but keys by client IP so it
 * also protects unauthenticated endpoints (`/auth/*`).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();
  /** Hard cap on tracked keys — drops the oldest bucket if exceeded. */
  private readonly maxKeys = 10_000;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) {
      return true;
    }

    const limit = this.numberFromEnv(
      `RATE_LIMIT_${options.name.toUpperCase()}_LIMIT`,
      options.limit,
    );
    const windowMs = this.numberFromEnv(
      `RATE_LIMIT_${options.name.toUpperCase()}_WINDOW_MS`,
      options.windowMs,
    );
    if (limit <= 0) {
      return true; // explicitly disabled via env
    }

    const request = context.switchToHttp().getRequest<Request>();
    const key = `${options.name}:${this.clientIp(request)}`;
    const now = Date.now();

    const fresh = (this.hits.get(key) ?? []).filter((ts) => now - ts < windowMs);
    if (fresh.length >= limit) {
      const retryAfter = Math.ceil((windowMs - (now - fresh[0])) / 1000);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Слишком много запросов, попробуйте позже',
          error: 'Too Many Requests',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    fresh.push(now);
    this.hits.set(key, fresh);
    this.evictIfNeeded();
    return true;
  }

  private numberFromEnv(name: string, fallback: number): number {
    const raw = this.config.get<string | number>(name);
    if (raw === undefined || raw === null || raw === '') {
      return fallback;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private clientIp(request: Request): string {
    return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
  }

  private evictIfNeeded(): void {
    if (this.hits.size <= this.maxKeys) {
      return;
    }
    const oldest = this.hits.keys().next().value;
    if (oldest !== undefined) {
      this.hits.delete(oldest);
    }
  }
}
