/**
 * ContentAuthGuard
 * Issue #1052 - Content write endpoints must require authentication.
 * Apply this guard to POST/PATCH/DELETE endpoints in ContentController.
 */
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class ContentAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: unknown }>();
    if (!request.user) {
      throw new UnauthorizedException('Authentication required to modify content');
    }
    return true;
  }
}