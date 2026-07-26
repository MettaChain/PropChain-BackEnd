import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { PrismaService } from '../database/prisma.service';

interface MockPrisma {
  activityLog: {
    create: jest.Mock;
  };
}

describe('AdminAuditInterceptor', () => {
  let interceptor: AdminAuditInterceptor;
  let mockPrisma: MockPrisma;

  beforeEach(() => {
    mockPrisma = {
      activityLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    interceptor = new AdminAuditInterceptor(mockPrisma as unknown as PrismaService);
  });

  function makeContext(overrides: Record<string, unknown> = {}): ExecutionContext {
    const request = {
      authUser: { sub: 'admin-1' },
      headers: { 'user-agent': 'test-agent' },
      method: 'POST',
      ip: '1.2.3.4',
      route: { path: '/admin/users' },
      socket: {},
      ...overrides,
    };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  const handler: CallHandler = { handle: () => of('result') };

  it('logs admin action with IP on success', (done) => {
    const ctx = makeContext();
    interceptor.intercept(ctx, handler).subscribe(() => {
      expect(mockPrisma.activityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'admin-1',
            ipAddress: '1.2.3.4',
            entityType: 'ADMIN',
          }),
        }),
      );
      done();
    });
  });

  it('uses x-forwarded-for header when present', (done) => {
    const ctx = makeContext({
      headers: { 'x-forwarded-for': '9.9.9.9, 1.1.1.1', 'user-agent': 'test' },
    });
    interceptor.intercept(ctx, handler).subscribe(() => {
      expect(mockPrisma.activityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ipAddress: '9.9.9.9' }),
        }),
      );
      done();
    });
  });

  it('skips logging when no authenticated user', (done) => {
    const ctx = makeContext({ authUser: null });
    interceptor.intercept(ctx, handler).subscribe(() => {
      expect(mockPrisma.activityLog.create).not.toHaveBeenCalled();
      done();
    });
  });

  it('does not throw when audit log creation fails', (done) => {
    mockPrisma.activityLog.create.mockRejectedValue(new Error('DB error'));
    const ctx = makeContext();
    interceptor.intercept(ctx, handler).subscribe({
      next: () => done(),
      error: done,
    });
  });
});
