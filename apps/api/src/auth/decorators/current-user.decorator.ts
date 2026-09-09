import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '../guards/jwt-auth.guard.js';

/**
 * Extracts the current authenticated user from the request.
 * Must be used with JwtAuthGuard.
 *
 * @example
 * ```ts
 * @Get('profile')
 * @UseGuards(JwtAuthGuard)
 * getProfile(@CurrentUser() user: AuthUser) {
 *   return user;
 * }
 *
 * @Get('me')
 * @UseGuards(JwtAuthGuard)
 * getMe(@CurrentUser('userId') userId: string) {
 *   return { id: userId };
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      return undefined;
    }

    return data ? user[data as keyof typeof user] : user;
  },
);
