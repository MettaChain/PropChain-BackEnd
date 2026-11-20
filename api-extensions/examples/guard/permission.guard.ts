import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './require-permission.decorator';

interface PermissionRequest {
  authUser?: {
    sub?: string;
    permissions?: string[];
  };
}

/**
 * Example guard implementing CanActivate.
 *
 * Flow:
 *  1. Reflector reads @RequirePermission metadata from the handler first,
 *     then the controller class (getAllAndOverride - handler wins).
 *  2. No metadata -> route is not permission-protected, allow.
 *  3. ExecutionContext gives access to the HTTP request and its authenticated user.
 *  4. The user must hold ALL required permissions.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<PermissionRequest>();
    const user = request.authUser;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    const granted = new Set(user.permissions ?? []);
    const missing = required.filter((permission) => !granted.has(permission));

    if (missing.length > 0) {
      throw new ForbiddenException(`Missing required permission(s): ${missing.join(', ')}`);
    }

    return true;
  }
}
