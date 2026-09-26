import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { KeyPermissionsGuard } from './key-permissions.guard';
import {
  API_KEY_SCOPES_KEY,
  ApiKeyScope,
  apiKeyHasScopes,
  resolveApiKeyScopes,
} from '../constants/api-key-scopes';

function makeContext(authUser: unknown): ExecutionContext {
  const request = { authUser };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeGuard(requiredScopes?: ApiKeyScope[]): KeyPermissionsGuard {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(requiredScopes),
  } as unknown as Reflector;
  return new KeyPermissionsGuard(reflector);
}

describe('KeyPermissionsGuard (#1293)', () => {
  it('allows routes without declared scopes', () => {
    const guard = makeGuard(undefined);
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('skips enforcement for JWT-authenticated callers', () => {
    const guard = makeGuard(['write']);
    const ctx = makeContext({ sub: 'u1', type: 'access' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows an API key holding the required scope', () => {
    const guard = makeGuard(['read']);
    const ctx = makeContext({ sub: 'u1', type: 'api-key', apiKeyPermissions: ['read'] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies a read-only API key on a write route', () => {
    const guard = makeGuard(['write']);
    const ctx = makeContext({ sub: 'u1', type: 'api-key', apiKeyPermissions: ['read'] });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('treats write as implying read', () => {
    const guard = makeGuard(['read']);
    const ctx = makeContext({ sub: 'u1', type: 'api-key', apiKeyPermissions: ['write'] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('grants wildcard API keys every scope', () => {
    const guard = makeGuard(['read', 'write']);
    const ctx = makeContext({ sub: 'u1', type: 'api-key', apiKeyPermissions: ['*'] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('grants unscoped legacy keys default read/write access', () => {
    const guard = makeGuard(['write']);
    const ctx = makeContext({ sub: 'u1', type: 'api-key', apiKeyPermissions: [] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws when the request has no authenticated user', () => {
    const guard = makeGuard(['read']);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });

  it('exposes the metadata key used by the decorator', () => {
    expect(API_KEY_SCOPES_KEY).toBe('api_key_scopes');
  });
});

describe('api key scope helpers (#1293)', () => {
  it('resolves write to include read', () => {
    const scopes = resolveApiKeyScopes(['write']);
    expect(scopes.has('write')).toBe(true);
    expect(scopes.has('read')).toBe(true);
  });

  it('treats empty permissions as legacy read+write', () => {
    expect(resolveApiKeyScopes([])).toEqual(new Set(['read', 'write']));
    expect(resolveApiKeyScopes(undefined)).toEqual(new Set(['read', 'write']));
  });

  it('normalises case and whitespace', () => {
    expect(apiKeyHasScopes([' READ '], ['read'])).toBe(true);
  });

  it('returns false when a required scope is missing', () => {
    expect(apiKeyHasScopes(['read'], ['read', 'write'])).toBe(false);
  });
});
