import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequireVerifiedEmail, VerifiedEmailGuard } from '../guards/verified-email.guard';

describe('VerifiedEmailGuard', () => {
  let guard: VerifiedEmailGuard;

  const contextFor = (request: Record<string, unknown> = {}, target?: unknown): ExecutionContext =>
    ({
      getHandler: () => target,
      getClass: () => target,
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    guard = new VerifiedEmailGuard(new Reflector());
  });

  it('allows a user with a verified email', () => {
    @RequireVerifiedEmail()
    class Controller {}

    const request = { authUser: { sub: 'user-1', isEmailVerified: true } };
    expect(guard.canActivate(contextFor(request, Controller))).toBe(true);
  });

  it('supports the emailVerified alias', () => {
    @RequireVerifiedEmail()
    class Controller {}

    const request = { authUser: { id: 'user-1', emailVerified: true } };
    expect(guard.canActivate(contextFor(request, Controller))).toBe(true);
  });

  it('denies a user with an unverified email', () => {
    @RequireVerifiedEmail()
    class Controller {}

    const request = { authUser: { sub: 'user-1', isEmailVerified: false } };
    expect(() => guard.canActivate(contextFor(request, Controller))).toThrow(ForbiddenException);
  });

  it('returns 401 when authUser is missing', () => {
    @RequireVerifiedEmail()
    class Controller {}

    expect(() => guard.canActivate(contextFor({}, Controller))).toThrow(UnauthorizedException);
  });

  it('returns 401 when the user has no identifier', () => {
    @RequireVerifiedEmail()
    class Controller {}

    const request = { authUser: { isEmailVerified: true } };
    expect(() => guard.canActivate(contextFor(request, Controller))).toThrow(UnauthorizedException);
  });

  it('allows requests when the decorator is absent', () => {
    class PublicController {}

    expect(guard.canActivate(contextFor({}, PublicController))).toBe(true);
  });

  it('applies when the decorator is placed on the controller class', () => {
    @RequireVerifiedEmail()
    class RestrictedController {}

    const context = {
      getHandler: () => () => undefined,
      getClass: () => RestrictedController,
      switchToHttp: () => ({ getRequest: () => ({ authUser: { sub: 'user-1' } }) }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
