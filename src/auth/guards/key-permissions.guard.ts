import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_KEY_SCOPES_KEY, ApiKeyScope, apiKeyHasScopes } from '../constants/api-key-scopes';
import { AuthUserPayload } from '../types/auth-user.type';

/**
 * Enforces the scopes declared on a route with `@RequireScopes()` against the
 * permissions attached to the API key that authenticated the request
 * (issue #1293).
 *
 * This guard must run after `ApiKeyAuthGuard`, which populates
 * `request.authUser`. Behaviour:
 *   - Routes without `@RequireScopes()` metadata are unaffected.
 *   - Bearer/JWT callers are skipped – their access is governed by
 *     `RolesGuard`, not key scopes.
 *   - API-key callers must hold every required scope or receive a 403.
 */
@Injectable()
export class KeyPermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<ApiKeyScope[]>(API_KEY_SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthUserPayload | undefined = request.authUser;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Only API-key scopes are enforced here; roles cover JWT callers.
    if (user.type !== 'api-key') {
      return true;
    }

    if (apiKeyHasScopes(user.apiKeyPermissions, requiredScopes)) {
      return true;
    }

    throw new ForbiddenException(
      `API key is missing required scope(s): ${requiredScopes.join(', ')}`,
    );
  }
}
