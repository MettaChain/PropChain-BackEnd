/**
 * API key scope model (issue #1293).
 *
 * API keys carry a `permissions` string array. Historically that column was
 * stored but never enforced, so every key inherited the full power of its
 * owning user. The helpers below turn the stored value into an effective set
 * of scopes that routes can enforce.
 *
 * Canonical scopes:
 *   - `read`  – safe, non-mutating access (GET/HEAD/OPTIONS).
 *   - `write` – mutating access. Implies `read`.
 *   - `*`     – wildcard, grants every scope. `admin` / `all` are accepted as
 *               aliases so existing keys created with broad labels keep working.
 *
 * Backward compatibility: a key with no declared permissions is treated as
 * a legacy/unscoped key and receives the default `read` + `write` scopes, so
 * existing integrations keep working. Explicitly scoped keys (e.g.
 * `['read']`) are enforced, which is the behaviour fix this issue targets.
 */

export type ApiKeyScope = 'read' | 'write' | '*';

export const API_KEY_SCOPES_KEY = 'api_key_scopes';

/** Permissions that grant every scope. */
const FULL_ACCESS_PERMISSIONS = new Set(['*', 'admin', 'all']);

/**
 * Reduce raw stored permissions to the effective set of granted scopes.
 * `write` implies `read`; unknown strings are kept as-is so custom scopes can
 * be enforced by callers that declare them.
 */
export function resolveApiKeyScopes(permissions?: string[] | null): Set<string> {
  // Legacy keys created before scopes were enforced carry no permissions.
  // Treat them as unscoped rather than denying all access outright.
  if (!permissions || permissions.length === 0) {
    return new Set<string>(['read', 'write']);
  }

  const granted = new Set<string>();

  for (const raw of permissions) {
    const permission = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (!permission) continue;

    if (FULL_ACCESS_PERMISSIONS.has(permission)) {
      return new Set<string>(['read', 'write']);
    }

    granted.add(permission);
  }

  if (granted.has('write')) {
    granted.add('read');
  }

  return granted;
}

/** True when every required scope is granted by the key's permissions. */
export function apiKeyHasScopes(
  permissions: string[] | undefined | null,
  required: ApiKeyScope[],
): boolean {
  if (!required || required.length === 0) return true;
  const granted = resolveApiKeyScopes(permissions);
  return required.every((scope) => granted.has(scope));
}
