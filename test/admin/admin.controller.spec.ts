import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminController } from '../../src/admin/admin.controller';
import { AdminService } from '../../src/admin/admin.service';
import { EmailService } from '../../src/email/email.service';
import { ArchiveService } from '../../src/archive/archive.service';
import { CleanupService } from '../../src/database/cleanup.service';
import { RolesGuard } from '../../src/auth/guards/roles.guard';
import { ROLES_KEY } from '../../src/auth/decorators/roles.decorator';
import { AuthUserPayload } from '../../src/auth/types/auth-user.type';
import { UserRole, UserTier } from '../../src/types/prisma.types';

function makeContext(role: UserRole): ExecutionContext {
  const user: AuthUserPayload = {
    sub: 'admin-1',
    email: 'actor@test.com',
    role,
    tier: UserTier.ENTERPRISE,
    type: 'access',
  };
  return {
    switchToHttp: () => ({ getRequest: () => ({ authUser: user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('AdminController - role enforcement', () => {
  const routes: Array<[string, keyof AdminController]> = [
    ['listUsers (user management)', 'listUsers'],
    ['updateUser (user management)', 'updateUser'],
    ['blockUser (user management)', 'blockUser'],
    ['getModerationQueue (content moderation)', 'getModerationQueue'],
    ['listFraudAlerts (fraud)', 'listFraudAlerts'],
    ['reviewFraudAlert (fraud)', 'reviewFraudAlert'],
    ['blockFraudUser (fraud)', 'blockFraudUser'],
    ['scanUserForFraud (fraud)', 'scanUserForFraud'],
    ['scanPropertyForFraud (fraud)', 'scanPropertyForFraud'],
  ];

  let controller: AdminController;
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    const adminService = {
      getDashboard: jest.fn(),
      listUsers: jest.fn(),
      updateUser: jest.fn(),
      setUserBlockedState: jest.fn(),
      getModerationQueue: jest.fn(),
      approveProperty: jest.fn(),
      rejectProperty: jest.fn(),
      flagProperty: jest.fn(),
      bulkModerate: jest.fn(),
      listFraudAlerts: jest.fn(),
      getFraudAlertsSummary: jest.fn(),
      getFraudAlertDetails: jest.fn(),
      reviewFraudAlert: jest.fn(),
      addFraudAlertNote: jest.fn(),
      blockFraudUser: jest.fn(),
      scanUserForFraud: jest.fn(),
      scanPropertyForFraud: jest.fn(),
      updateTransactionStatus: jest.fn(),
    };

    controller = new AdminController(
      adminService as unknown as AdminService,
      {} as unknown as EmailService,
      {} as unknown as ArchiveService,
      {} as unknown as CleanupService,
    );

    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('requires the ADMIN role on every user-management and fraud route', () => {
    for (const [, method] of routes) {
      const required = reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
        AdminController,
        controller[method] as never,
      ]);
      expect(required).toEqual([UserRole.ADMIN]);
    }
  });

  it('allows ADMIN to invoke admin-only routes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);
    expect(guard.canActivate(makeContext(UserRole.ADMIN))).toBe(true);
  });

  it('rejects USER and AGENT from admin-only routes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);

    expect(() => guard.canActivate(makeContext(UserRole.USER))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(makeContext(UserRole.AGENT))).toThrow(ForbiddenException);
  });
});
