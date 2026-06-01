/**
 * RBAC unit tests for critical routes (Issue #594)
 * Tests that USER, AGENT, and ADMIN roles are correctly enforced.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { UserRole } from '../types/prisma.types';

function makeContext(role: UserRole, requiredRoles: UserRole[] | null) {
  const user: AuthUserPayload = { sub: 'u1', email: 'u@test.com', role, type: 'access' };
  const request = { authUser: user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
    _requiredRoles: requiredRoles,
  };
}

describe('RolesGuard - RBAC enforcement', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();

    guard = module.get(RolesGuard);
    reflector = module.get(Reflector);
  });

  function setupRoles(roles: UserRole[] | null) {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);
  }

  describe('Admin-only routes', () => {
    it('allows ADMIN to access admin routes', () => {
      setupRoles([UserRole.ADMIN]);
      const ctx = makeContext(UserRole.ADMIN, [UserRole.ADMIN]);
      expect(guard.canActivate(ctx as any)).toBe(true);
    });

    it('rejects USER from admin routes', () => {
      setupRoles([UserRole.ADMIN]);
      const ctx = makeContext(UserRole.USER, [UserRole.ADMIN]);
      expect(() => guard.canActivate(ctx as any)).toThrow(ForbiddenException);
    });

    it('rejects AGENT from admin routes', () => {
      setupRoles([UserRole.ADMIN]);
      const ctx = makeContext(UserRole.AGENT, [UserRole.ADMIN]);
      expect(() => guard.canActivate(ctx as any)).toThrow(ForbiddenException);
    });
  });

  describe('Agent and Admin routes (e.g. create transaction)', () => {
    it('allows AGENT to access agent+admin routes', () => {
      setupRoles([UserRole.AGENT, UserRole.ADMIN]);
      const ctx = makeContext(UserRole.AGENT, [UserRole.AGENT, UserRole.ADMIN]);
      expect(guard.canActivate(ctx as any)).toBe(true);
    });

    it('allows ADMIN to access agent+admin routes', () => {
      setupRoles([UserRole.AGENT, UserRole.ADMIN]);
      const ctx = makeContext(UserRole.ADMIN, [UserRole.AGENT, UserRole.ADMIN]);
      expect(guard.canActivate(ctx as any)).toBe(true);
    });

    it('rejects USER from agent+admin routes', () => {
      setupRoles([UserRole.AGENT, UserRole.ADMIN]);
      const ctx = makeContext(UserRole.USER, [UserRole.AGENT, UserRole.ADMIN]);
      expect(() => guard.canActivate(ctx as any)).toThrow(ForbiddenException);
    });
  });

  describe('Public routes (no role required)', () => {
    it('allows any authenticated user when no roles are required', () => {
      setupRoles(null);
      const ctx = makeContext(UserRole.USER, null);
      expect(guard.canActivate(ctx as any)).toBe(true);
    });
  });

  describe('Unauthorized requests', () => {
    it('throws ForbiddenException when user has no role', () => {
      setupRoles([UserRole.ADMIN]);
      const request = { authUser: { sub: 'u1', email: 'u@test.com', type: 'access' } };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => ({}),
        getClass: () => ({}),
      };
      expect(() => guard.canActivate(ctx as any)).toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when no user in request', () => {
      setupRoles([UserRole.ADMIN]);
      const ctx = {
        switchToHttp: () => ({ getRequest: () => ({}) }),
        getHandler: () => ({}),
        getClass: () => ({}),
      };
      expect(() => guard.canActivate(ctx as any)).toThrow(ForbiddenException);
    });
  });
});

// --- Property module RBAC ---
import { PropertiesController } from '../properties/properties.controller';
import { PropertiesService } from '../properties/properties.service';
import { PropertyReportService } from '../properties/report/property-report.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('PropertiesController - RBAC', () => {
  let controller: PropertiesController;
  let service: jest.Mocked<PropertiesService>;

  const adminUser: AuthUserPayload = { sub: 'admin-1', email: 'admin@test.com', role: UserRole.ADMIN, type: 'access' };
  const regularUser: AuthUserPayload = { sub: 'user-1', email: 'user@test.com', role: UserRole.USER, type: 'access' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PropertiesController],
      providers: [
        { provide: PropertiesService, useValue: { create: jest.fn().mockResolvedValue({ id: 'p1' }), findAll: jest.fn().mockResolvedValue([]) } },
        { provide: PropertyReportService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(PropertiesController);
    service = module.get(PropertiesService) as jest.Mocked<PropertiesService>;
  });

  it('USER can create a property (authenticated)', async () => {
    const dto = { title: 'Test', address: '1 Main', city: 'NY', state: 'NY', zipCode: '10001', price: 100000, propertyType: 'House' } as any;
    const result = await controller.create(dto, regularUser);
    expect(result).toEqual({ id: 'p1' });
    expect(service.create).toHaveBeenCalledWith(dto, regularUser.sub);
  });

  it('ADMIN can create a property', async () => {
    const dto = { title: 'Admin Prop', address: '2 Main', city: 'NY', state: 'NY', zipCode: '10001', price: 200000, propertyType: 'Condo' } as any;
    await controller.create(dto, adminUser);
    expect(service.create).toHaveBeenCalledWith(dto, adminUser.sub);
  });
});

// --- Admin module RBAC ---

describe('AdminController - RBAC (guard integration)', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();
    guard = module.get(RolesGuard);
    reflector = module.get(Reflector);
  });

  it('ADMIN can access admin dashboard', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);
    const ctx = makeContext(UserRole.ADMIN, [UserRole.ADMIN]);
    expect(guard.canActivate(ctx as any)).toBe(true);
  });

  it('USER cannot access admin dashboard', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);
    const ctx = makeContext(UserRole.USER, [UserRole.ADMIN]);
    expect(() => guard.canActivate(ctx as any)).toThrow(ForbiddenException);
  });

  it('AGENT cannot access admin dashboard', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);
    const ctx = makeContext(UserRole.AGENT, [UserRole.ADMIN]);
    expect(() => guard.canActivate(ctx as any)).toThrow(ForbiddenException);
  });
});

// --- Transaction module RBAC ---
describe('TransactionsController - RBAC (guard integration)', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();
    guard = module.get(RolesGuard);
    reflector = module.get(Reflector);
  });

  it('AGENT can create transactions', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.AGENT, UserRole.ADMIN]);
    const ctx = makeContext(UserRole.AGENT, [UserRole.AGENT, UserRole.ADMIN]);
    expect(guard.canActivate(ctx as any)).toBe(true);
  });

  it('ADMIN can create transactions', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.AGENT, UserRole.ADMIN]);
    const ctx = makeContext(UserRole.ADMIN, [UserRole.AGENT, UserRole.ADMIN]);
    expect(guard.canActivate(ctx as any)).toBe(true);
  });

  it('USER cannot create transactions', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.AGENT, UserRole.ADMIN]);
    const ctx = makeContext(UserRole.USER, [UserRole.AGENT, UserRole.ADMIN]);
    expect(() => guard.canActivate(ctx as any)).toThrow(ForbiddenException);
  });
});
