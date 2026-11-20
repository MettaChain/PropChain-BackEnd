import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GuardExampleController } from './guard-example.controller';
import { PermissionGuard } from './permission.guard';
import { PERMISSIONS_KEY } from './require-permission.decorator';

const createContext = (
  handler: (...args: unknown[]) => unknown,
  authUser?: { sub?: string; permissions?: string[] },
): ExecutionContext =>
  ({
    getHandler: () => handler,
    getClass: () => GuardExampleController,
    switchToHttp: () => ({
      getRequest: () => ({ authUser }),
    }),
  }) as unknown as ExecutionContext;

describe('PermissionGuard (example)', () => {
  const reflector = new Reflector();
  const guard = new PermissionGuard(reflector);
  const proto = GuardExampleController.prototype;

  it('stores permissions via @RequirePermission metadata', () => {
    expect(reflector.get(PERMISSIONS_KEY, proto.update)).toEqual(['property:update']);
    expect(reflector.get(PERMISSIONS_KEY, GuardExampleController)).toEqual(['property:read']);
  });

  it('falls back to class-level metadata', () => {
    const ctx = createContext(proto.findOne, { sub: 'u1', permissions: ['property:read'] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('lets handler-level metadata override the class default', () => {
    const ctx = createContext(proto.update, { sub: 'u1', permissions: ['property:read'] });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('requires all listed permissions', () => {
    const partial = createContext(proto.remove, { sub: 'u1', permissions: ['property:delete'] });
    const full = createContext(proto.remove, {
      sub: 'u1',
      permissions: ['property:delete', 'property:admin'],
    });

    expect(() => guard.canActivate(partial)).toThrow(ForbiddenException);
    expect(guard.canActivate(full)).toBe(true);
  });

  it('throws UnauthorizedException when no user is attached', () => {
    const ctx = createContext(proto.findOne);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('allows routes without permission metadata', () => {
    const unprotected = function unprotected() {};
    const ctx = {
      getHandler: () => unprotected,
      getClass: () => class Plain {},
      switchToHttp: () => ({ getRequest: () => ({}) }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('can be tested with a mocked Reflector', () => {
    const mockReflector = { getAllAndOverride: jest.fn().mockReturnValue(['x:y']) };
    const mockedGuard = new PermissionGuard(mockReflector as unknown as Reflector);
    const ctx = createContext(proto.findOne, { sub: 'u1', permissions: ['x:y'] });

    expect(mockedGuard.canActivate(ctx)).toBe(true);
    expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(PERMISSIONS_KEY, [
      proto.findOne,
      GuardExampleController,
    ]);
  });
});
