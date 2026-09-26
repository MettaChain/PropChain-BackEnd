import { SetMetadata } from '@nestjs/common';
import { API_KEY_SCOPES_KEY, ApiKeyScope } from '../constants/api-key-scopes';

/**
 * Declares the API-key scopes required to reach a route (issue #1293).
 *
 * The metadata is read by `KeyPermissionsGuard`. Routes without this
 * decorator are unaffected, and JWTs are governed by `RolesGuard` instead of
 * key scopes.
 */
export const RequireScopes = (...scopes: ApiKeyScope[]) => SetMetadata(API_KEY_SCOPES_KEY, scopes);
