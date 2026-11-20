import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_FLAG_KEY } from '../guards/feature-flag.decorator';
import { FeatureFlagGuard, FeatureFlagSource } from '../guards/feature-flag.guard';

function contextFor(request: Record<string, unknown>): ExecutionContext {
  const handler = () => undefined;
  const controller = class TestController {};
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('FeatureFlagGuard (#1562)', () => {
  const originalEnv = process.env;
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: FeatureFlagGuard;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.FEATURE_FLAG_OVERRIDES;
    delete process.env.FEATURE_FLAG_NEW_CHECKOUT;
    delete process.env.FEATURE_FLAG_NEW_CHECKOUT_V2;
    delete process.env.FEATURE_FLAG_ASYNC_FLAG;
    reflector = { getAllAndOverride: jest.fn() };
    guard = new FeatureFlagGuard(reflector as unknown as Reflector);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  function flag(value: string | undefined): void {
    reflector.getAllAndOverride.mockReturnValue(value);
  }

  it('allows requests when no feature flag metadata is present', async () => {
    flag(undefined);
    const source: FeatureFlagSource = { isEnabled: jest.fn().mockReturnValue(false) };
    guard = new FeatureFlagGuard(reflector as unknown as Reflector, source);
    const context = contextFor({});

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(FEATURE_FLAG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    expect(source.isEnabled).not.toHaveBeenCalled();
  });

  it.each(['true', '1', 'enabled', 'on', ' ENABLED '])(
    'allows requests when the environment enables the flag with %p',
    async (value) => {
      flag('new.checkout');
      process.env.FEATURE_FLAG_NEW_CHECKOUT = value;

      await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
    },
  );

  it.each(['false', '0', 'random', ''])(
    'denies requests when the environment value is %p',
    async (value) => {
      flag('new.checkout');
      process.env.FEATURE_FLAG_NEW_CHECKOUT = value;

      await expect(guard.canActivate(contextFor({}))).rejects.toThrow(ForbiddenException);
    },
  );

  it('denies requests when the flag has no environment value', async () => {
    flag('new.checkout');

    await expect(guard.canActivate(contextFor({}))).rejects.toThrow(
      'Feature new.checkout is not enabled for this user or tenant',
    );
  });

  it('normalizes non-alphanumeric characters in the flag name', async () => {
    flag('new-checkout.v2');
    process.env.FEATURE_FLAG_NEW_CHECKOUT_V2 = 'true';

    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
  });

  it('allows a user-specific override from the sub claim', async () => {
    flag('new.checkout');
    process.env.FEATURE_FLAG_OVERRIDES = JSON.stringify({
      'new.checkout': { users: ['user-1'] },
    });

    await expect(guard.canActivate(contextFor({ authUser: { sub: 'user-1' } }))).resolves.toBe(
      true,
    );
  });

  it('allows a user-specific override from the id claim', async () => {
    flag('new.checkout');
    process.env.FEATURE_FLAG_OVERRIDES = JSON.stringify({
      'new.checkout': { users: ['user-2'] },
    });

    await expect(guard.canActivate(contextFor({ authUser: { id: 'user-2' } }))).resolves.toBe(true);
  });

  it('ignores user overrides when the request has no user identifier', async () => {
    flag('new.checkout');
    process.env.FEATURE_FLAG_OVERRIDES = JSON.stringify({
      'new.checkout': { users: ['user-1'] },
    });

    await expect(guard.canActivate(contextFor({ authUser: {} }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows a tenant-specific override from the authenticated user', async () => {
    flag('new.checkout');
    process.env.FEATURE_FLAG_OVERRIDES = JSON.stringify({
      'new.checkout': { tenants: ['tenant-1'] },
    });

    await expect(
      guard.canActivate(contextFor({ authUser: { tenantId: 'tenant-1' } })),
    ).resolves.toBe(true);
  });

  it('allows a tenant-specific override from a string header', async () => {
    flag('new.checkout');
    process.env.FEATURE_FLAG_OVERRIDES = JSON.stringify({
      'new.checkout': { tenants: ['tenant-2'] },
    });

    await expect(
      guard.canActivate(contextFor({ headers: { 'x-tenant-id': 'tenant-2' } })),
    ).resolves.toBe(true);
  });

  it('uses the first value of an array tenant header', async () => {
    flag('new.checkout');
    process.env.FEATURE_FLAG_OVERRIDES = JSON.stringify({
      'new.checkout': { tenants: ['tenant-3'] },
    });

    await expect(
      guard.canActivate(contextFor({ headers: { 'x-tenant-id': ['tenant-3', 'tenant-4'] } })),
    ).resolves.toBe(true);
  });

  it('ignores tenant overrides when the request has no tenant identifier', async () => {
    flag('new.checkout');
    process.env.FEATURE_FLAG_OVERRIDES = JSON.stringify({
      'new.checkout': { tenants: ['tenant-1'] },
    });

    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('handles requests without headers', async () => {
    flag('new.checkout');
    process.env.FEATURE_FLAG_OVERRIDES = JSON.stringify({
      'new.checkout': { tenants: ['tenant-1'] },
    });

    await expect(guard.canActivate(contextFor({}))).rejects.toThrow(ForbiddenException);
  });

  it('falls back to the environment when overrides cannot be parsed', async () => {
    flag('new.checkout');
    process.env.FEATURE_FLAG_OVERRIDES = '{not-json';
    process.env.FEATURE_FLAG_NEW_CHECKOUT = 'false';

    await expect(guard.canActivate(contextFor({}))).rejects.toThrow(ForbiddenException);
  });

  it('falls back to the environment when the flag has no override entry', async () => {
    flag('new.checkout');
    process.env.FEATURE_FLAG_OVERRIDES = JSON.stringify({ 'other.flag': { users: ['user-1'] } });
    process.env.FEATURE_FLAG_NEW_CHECKOUT = 'false';

    await expect(guard.canActivate(contextFor({ authUser: { sub: 'user-1' } }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('falls back to the environment when the override lists are missing', async () => {
    flag('new.checkout');
    process.env.FEATURE_FLAG_OVERRIDES = JSON.stringify({ 'new.checkout': {} });
    process.env.FEATURE_FLAG_NEW_CHECKOUT = 'false';

    await expect(
      guard.canActivate(contextFor({ authUser: { sub: 'user-1', tenantId: 'tenant-1' } })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('uses a synchronous feature flag source with the request context', async () => {
    flag('new.checkout');
    const isEnabled = jest.fn().mockReturnValue(true);
    guard = new FeatureFlagGuard(reflector as unknown as Reflector, { isEnabled });
    const request = {
      authUser: { id: 'user-9', tenantId: 'tenant-9' },
      headers: { 'x-tenant-id': 'ignored' },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(isEnabled).toHaveBeenCalledWith('new.checkout', {
      userId: 'user-9',
      tenantId: 'tenant-9',
    });
  });

  it('awaits an asynchronous feature flag source and denies when it returns false', async () => {
    flag('async.flag');
    const isEnabled = jest.fn().mockResolvedValue(false);
    guard = new FeatureFlagGuard(reflector as unknown as Reflector, { isEnabled });

    await expect(
      guard.canActivate(
        contextFor({
          authUser: { sub: 'user-1' },
          headers: { 'x-tenant-id': ['tenant-1'] },
        }),
      ),
    ).rejects.toThrow('Feature async.flag is not enabled for this user or tenant');
    expect(isEnabled).toHaveBeenCalledWith('async.flag', {
      userId: 'user-1',
      tenantId: 'tenant-1',
    });
  });

  it('propagates errors from the feature flag source', async () => {
    flag('new.checkout');
    const error = new Error('flag service unavailable');
    guard = new FeatureFlagGuard(reflector as unknown as Reflector, {
      isEnabled: jest.fn().mockRejectedValue(error),
    });

    await expect(guard.canActivate(contextFor({}))).rejects.toBe(error);
  });
});
