import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { PrismaService } from '../../src/database/prisma.service';
import {
  AuditLevel,
  AuditTrailInterceptor,
  Audited,
} from '../interceptors/audit-trail.interceptor';

describe('AuditTrailInterceptor', () => {
  let create: jest.Mock;
  let interceptor: AuditTrailInterceptor;
  const result = { id: 'property-1', title: 'Updated' };

  const contextFor = (
    overrides: Record<string, unknown> = {},
    target?: unknown,
  ): ExecutionContext => {
    const request = {
      authUser: { sub: 'user-1' },
      headers: { 'user-agent': 'test-agent' },
      method: 'POST',
      ip: '1.2.3.4',
      route: { path: '/properties/:propertyId' },
      body: { title: 'New' },
      ...overrides,
    };
    const defaultHandler = () => undefined;
    class DefaultController {}
    return {
      getHandler: () => target ?? defaultHandler,
      getClass: () => target ?? DefaultController,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  };

  const run = (context: ExecutionContext) =>
    firstValueFrom(interceptor.intercept(context, { handle: () => of(result) } as CallHandler));

  beforeEach(() => {
    create = jest.fn().mockResolvedValue({});
    interceptor = new AuditTrailInterceptor(
      { activityLog: { create } } as unknown as PrismaService,
      new Reflector(),
    );
  });

  it('supports the decorator without explicit options', async () => {
    @Audited()
    class Controller {}

    await run(contextFor({}, Controller));
    expect(create.mock.calls[0][0].data.metadata.level).toBe(AuditLevel.DETAILED);
  });

  it('handles requests without a method, route, URL or headers', async () => {
    await run(
      contextFor({ method: undefined, route: undefined, url: undefined, headers: undefined }),
    );
    expect(create).not.toHaveBeenCalled();

    await run(contextFor({ method: 'POST', route: undefined, url: undefined, headers: undefined }));
    expect(create.mock.calls[0][0].data.metadata.path).toBe('');
    expect(create.mock.calls[0][0].data.ipAddress).toBe('1.2.3.4');
  });

  it('handles a request with headers that omit the user agent', async () => {
    await run(contextFor({ headers: {} }));
    expect(create.mock.calls[0][0].data.userAgent).toBeUndefined();
  });

  it('records an audit entry for POST operations', async () => {
    await run(contextFor());
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        action: 'AUDIT_POST__PROPERTIES_:PROPERTYID',
        entityType: 'UNKNOWN',
        description: 'Audit: POST /properties/:propertyId',
        ipAddress: '1.2.3.4',
        userAgent: 'test-agent',
      }),
    });
  });

  it('records an audit entry for PATCH operations with before and after state', async () => {
    @Audited({ level: AuditLevel.FULL, entityType: 'PROPERTY' })
    class Controller {}

    await run(contextFor({ method: 'PATCH', auditBefore: { title: 'Old' } }, Controller));
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: 'PROPERTY',
        metadata: expect.objectContaining({
          level: AuditLevel.FULL,
          before: { title: 'Old' },
          after: result,
        }),
      }),
    });
  });

  it('captures before state from existingState or the request body', async () => {
    @Audited({ level: AuditLevel.FULL })
    class Controller {}

    await run(contextFor({ existingState: { title: 'Existing' } }, Controller));
    expect(create.mock.calls[0][0].data.metadata.before).toEqual({ title: 'Existing' });

    create.mockClear();
    await run(contextFor({}, Controller));
    expect(create.mock.calls[0][0].data.metadata.before).toEqual({ title: 'New' });
  });

  it('does not record audit entries for GET operations', async () => {
    await run(contextFor({ method: 'GET' }));
    expect(create).not.toHaveBeenCalled();
  });

  it('applies the configured audit level and custom action', async () => {
    @Audited({ level: AuditLevel.BASIC, action: 'PROPERTY_PUBLISH' })
    class Controller {}

    await run(contextFor({}, Controller));
    const metadata = create.mock.calls[0][0].data.metadata;
    expect(metadata).toEqual({
      method: 'POST',
      path: '/properties/:propertyId',
      level: AuditLevel.BASIC,
    });
    expect(create.mock.calls[0][0].data.action).toBe('PROPERTY_PUBLISH');
  });

  it('includes the response payload for the default detailed level', async () => {
    await run(contextFor());
    expect(create.mock.calls[0][0].data.metadata).toEqual(
      expect.objectContaining({ level: AuditLevel.DETAILED, after: result }),
    );
  });

  it('captures the user ID from the id alias', async () => {
    await run(contextFor({ authUser: { id: 'user-2' } }));
    expect(create.mock.calls[0][0].data.userId).toBe('user-2');
  });

  it('skips audit entries when there is no authenticated user', async () => {
    await run(contextFor({ authUser: undefined }));
    expect(create).not.toHaveBeenCalled();
  });

  it('uses the first X-Forwarded-For hop and falls back through IP sources', async () => {
    await run(contextFor({ headers: { 'x-forwarded-for': ['9.9.9.9, 1.1.1.1'] } }));
    expect(create.mock.calls[0][0].data.ipAddress).toBe('9.9.9.9');

    create.mockClear();
    await run(contextFor({ ip: undefined, socket: { remoteAddress: '5.6.7.8' } }));
    expect(create.mock.calls[0][0].data.ipAddress).toBe('5.6.7.8');

    create.mockClear();
    await run(contextFor({ ip: undefined, socket: undefined }));
    expect(create.mock.calls[0][0].data.ipAddress).toBe('unknown');
  });

  it('uses the URL when no route path is available', async () => {
    await run(contextFor({ route: undefined, url: '/fallback' }));
    expect(create.mock.calls[0][0].data.metadata.path).toBe('/fallback');
  });

  it('does not fail the request when audit persistence fails', async () => {
    create.mockRejectedValue(new Error('database unavailable'));
    await expect(run(contextFor())).resolves.toEqual(result);
  });
});
