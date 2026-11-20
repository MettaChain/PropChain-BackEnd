import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequireOwnership, ResourceOwnershipGuard } from '../guards/resource-ownership.guard';

describe('ResourceOwnershipGuard', () => {
  type FindUnique = jest.Mock;
  interface Mocks {
    property: { findUnique: FindUnique };
    transaction: { findUnique: FindUnique };
    document: { findUnique: FindUnique };
  }

  let prisma: Mocks;
  let guard: ResourceOwnershipGuard;

  const contextFor = (request: Record<string, unknown>, target?: unknown): ExecutionContext =>
    ({
      getHandler: () => target,
      getClass: () => target,
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  const requestWith = (overrides: Record<string, unknown> = {}) => ({
    params: { propertyId: 'property-1', transactionId: 'transaction-1', documentId: 'document-1' },
    authUser: { sub: 'user-1', role: 'USER' },
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      property: { findUnique: jest.fn() },
      transaction: { findUnique: jest.fn() },
      document: { findUnique: jest.fn() },
    };
    guard = new ResourceOwnershipGuard(new Reflector(), prisma as never);
  });

  it('allows access to a resource owned by the user', async () => {
    @RequireOwnership('property')
    class Controller {}

    prisma.property.findUnique.mockResolvedValue({ ownerId: 'user-1' });
    await expect(guard.canActivate(contextFor(requestWith(), Controller))).resolves.toBe(true);
    expect(prisma.property.findUnique).toHaveBeenCalledWith({
      where: { id: 'property-1' },
      select: { ownerId: true },
    });
  });

  it('denies access to a resource owned by somebody else', async () => {
    @RequireOwnership('property')
    class Controller {}

    prisma.property.findUnique.mockResolvedValue({ ownerId: 'user-2' });
    await expect(guard.canActivate(contextFor(requestWith(), Controller))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows an admin role to override ownership', async () => {
    @RequireOwnership('property')
    class Controller {}

    prisma.property.findUnique.mockResolvedValue({ ownerId: 'user-2' });
    const request = requestWith({ authUser: { sub: 'admin-1', role: 'ADMIN' } });
    await expect(guard.canActivate(contextFor(request, Controller))).resolves.toBe(true);
    expect(prisma.property.findUnique).not.toHaveBeenCalled();
  });

  it('supports custom allowed roles', async () => {
    @RequireOwnership('property', { allowRoles: ['AGENT'] })
    class Controller {}

    const request = requestWith({ authUser: { sub: 'agent-1', role: 'AGENT' } });
    await expect(guard.canActivate(contextFor(request, Controller))).resolves.toBe(true);
  });

  it('checks buyerId and sellerId for transactions', async () => {
    @RequireOwnership('transaction')
    class Controller {}

    prisma.transaction.findUnique.mockResolvedValue({ buyerId: 'user-9', sellerId: 'user-1' });
    await expect(guard.canActivate(contextFor(requestWith(), Controller))).resolves.toBe(true);
  });

  it('checks userId for documents', async () => {
    @RequireOwnership('document')
    class Controller {}

    prisma.document.findUnique.mockResolvedValue({ userId: 'user-1' });
    await expect(guard.canActivate(contextFor(requestWith(), Controller))).resolves.toBe(true);
  });

  it('denies when the resource does not exist', async () => {
    @RequireOwnership('document')
    class Controller {}

    prisma.document.findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(contextFor(requestWith(), Controller))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('denies when the resource id is missing from params', async () => {
    @RequireOwnership('property')
    class Controller {}

    const request = { params: {}, authUser: { sub: 'user-1' } };
    await expect(guard.canActivate(contextFor(request, Controller))).rejects.toThrow(
      'Resource identifier is missing',
    );
  });

  it('supports a custom param name and generic id param', async () => {
    @RequireOwnership('property', { param: 'listingId' })
    class ListingController {}
    @RequireOwnership('property')
    class GenericController {}

    prisma.property.findUnique.mockResolvedValue({ ownerId: 'user-1' });
    await expect(
      guard.canActivate(
        contextFor(requestWith({ params: { listingId: 'listing-7' } }), ListingController),
      ),
    ).resolves.toBe(true);
    expect(prisma.property.findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: 'listing-7' } }),
    );

    await expect(
      guard.canActivate(
        contextFor(requestWith({ params: { id: 'generic-1' } }), GenericController),
      ),
    ).resolves.toBe(true);
    expect(prisma.property.findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: 'generic-1' } }),
    );
  });

  it('denies unauthenticated requests', async () => {
    @RequireOwnership('property')
    class Controller {}

    await expect(
      guard.canActivate(contextFor(requestWith({ authUser: undefined }), Controller)),
    ).rejects.toThrow('Authentication required');
  });

  it('allows requests when the decorator is absent', async () => {
    class PublicController {}

    await expect(guard.canActivate(contextFor(requestWith(), PublicController))).resolves.toBe(
      true,
    );
    expect(prisma.property.findUnique).not.toHaveBeenCalled();
  });

  it('accepts array-valued resource identifiers', async () => {
    @RequireOwnership('property')
    class Controller {}

    prisma.property.findUnique.mockResolvedValue({ ownerId: 'user-1' });
    const request = requestWith({ params: { propertyId: ['property-1', 'property-2'] } });
    await expect(guard.canActivate(contextFor(request, Controller))).resolves.toBe(true);
    expect(prisma.property.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'property-1' } }),
    );
  });

  it('allows unknown resource types declared by an older decorator', async () => {
    const metadata = { resource: 'unknown', options: {} };
    class LegacyController {}
    Reflect.defineMetadata('resource-ownership', metadata, LegacyController);

    await expect(guard.canActivate(contextFor(requestWith(), LegacyController))).resolves.toBe(
      true,
    );
  });

  it('denies when no PrismaService is available', async () => {
    @RequireOwnership('property')
    class Controller {}

    const withoutPrisma = new ResourceOwnershipGuard(new Reflector());
    await expect(withoutPrisma.canActivate(contextFor(requestWith(), Controller))).rejects.toThrow(
      'Ownership cannot be verified',
    );
  });
});
