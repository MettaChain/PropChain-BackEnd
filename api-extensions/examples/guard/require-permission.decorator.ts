import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'required-permissions';

/**
 * Attaches the permissions required to access a route (or every route of a
 * controller) as metadata. PermissionGuard reads it back via Reflector.
 *
 * @example
 *   @RequirePermission('property:update')
 *   @RequirePermission('property:read', 'property:export')
 */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
