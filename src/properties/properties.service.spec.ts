import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PropertiesService } from './properties.service';
import { PrismaService } from '../database/prisma.service';
import { FraudService } from '../fraud/fraud.service';
import { GeocodingService } from './geocoding.service';
import { CacheService } from '../cache/cache.service';
import { AppLogger } from '../common/logger';
import { PropertyStatus, UserRole } from '../types/prisma.types';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { DEFAULT_PROPERTY_STATUS } from './property-status.constants';

describe('PropertiesService', () => {
  let service: PropertiesService;

  const prisma = {
    property: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    propertyAgent: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    propertyAmenity: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    // searchProperties reads the page and the total in one transaction.
    $transaction: jest.fn(),
  };
  const fraud = { evaluatePropertyCreated: jest.fn() };
  const geocoding = { geocodeAddress: jest.fn(), hasAddressChanged: jest.fn().mockReturnValue(false) };
  const cache = { invalidateByTag: jest.fn(), get: jest.fn(), set: jest.fn(), del: jest.fn() };

  // Coordinates are supplied so the geocoding path is not involved.
  const createDto = {
    title: 'Loft',
    address: '1 Main St',
    city: 'Austin',
    state: 'TX',
    zipCode: '73301',
    country: 'USA',
    price: 250000,
    propertyType: 'APARTMENT',
    squareFeet: 900,
    latitude: 30.26,
    longitude: -97.74,
  };

  const user = (role: UserRole, sub = 'user-1') => ({ sub, role }) as unknown as AuthUserPayload;

  beforeEach(async () => {
    jest.resetAllMocks();
    geocoding.hasAddressChanged.mockReturnValue(false);
    jest.spyOn(AppLogger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(AppLogger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(AppLogger.prototype, 'error').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropertiesService,
        { provide: PrismaService, useValue: prisma },
        { provide: FraudService, useValue: fraud },
        { provide: GeocodingService, useValue: geocoding },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();
    service = module.get(PropertiesService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('create', () => {
    beforeEach(() => {
      prisma.property.findFirst.mockResolvedValue(null);
      prisma.property.create.mockImplementation(async ({ data }: { data: unknown }) => ({
        id: 'p1',
        ...(data as object),
      }));
    });

    it('rejects a duplicate address', async () => {
      prisma.property.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.create(createDto as never, 'owner-1')).rejects.toThrow(BadRequestException);
      expect(prisma.property.create).not.toHaveBeenCalled();
    });

    it('checks for duplicates on the full address', async () => {
      await service.create(createDto as never, 'owner-1');
      expect(prisma.property.findFirst).toHaveBeenCalledWith({
        where: {
          address: '1 Main St',
          city: 'Austin',
          state: 'TX',
          zipCode: '73301',
          country: 'USA',
        },
      });
    });

    it('creates a pending property connected to its owner, with Decimal money fields', async () => {
      await service.create(createDto as never, 'owner-1');

      const data = prisma.property.create.mock.calls[0][0].data;
      expect(data.status).toBe(DEFAULT_PROPERTY_STATUS);
      expect(data.owner).toEqual({ connect: { id: 'owner-1' } });
      expect(data.price).toEqual(new Decimal('250000'));
      expect(data.squareFeet).toEqual(new Decimal('900'));
      expect(data.lotSize).toBeNull();
      expect(data.hoaMonthlyFee).toBeNull();
      expect(data.latitude).toBe(30.26);
      expect(geocoding.geocodeAddress).not.toHaveBeenCalled();
    });

    it('runs the fraud check and invalidates the property cache', async () => {
      await service.create(createDto as never, 'owner-1');
      expect(fraud.evaluatePropertyCreated).toHaveBeenCalledWith('p1');
      expect(cache.invalidateByTag).toHaveBeenCalledTimes(1);
    });

    it('still returns the created property when the fraud check fails', async () => {
      fraud.evaluatePropertyCreated.mockRejectedValue(new Error('fraud service down'));

      await expect(service.create(createDto as never, 'owner-1')).resolves.toMatchObject({ id: 'p1' });
      expect(cache.invalidateByTag).toHaveBeenCalled();
    });

    it('still returns the created property when cache invalidation fails', async () => {
      cache.invalidateByTag.mockRejectedValue(new Error('redis down'));

      await expect(service.create(createDto as never, 'owner-1')).resolves.toMatchObject({ id: 'p1' });
    });
  });

  describe('findOne / findByOwnerId', () => {
    it('findOne returns null for an unknown id', async () => {
      prisma.property.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).resolves.toBeNull();
      expect(prisma.property.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'missing' } }),
      );
    });

    it('findOne exposes only public owner fields', async () => {
      prisma.property.findUnique.mockResolvedValue({ id: 'p1' });
      await service.findOne('p1');
      const include = prisma.property.findUnique.mock.calls[0][0].include;
      expect(Object.keys(include.owner.select).sort()).toEqual(['email', 'firstName', 'id', 'lastName']);
    });

    it('findByOwnerId lists the owner\'s properties newest first', async () => {
      prisma.property.findMany.mockResolvedValue([]);
      await service.findByOwnerId('owner-1');
      expect(prisma.property.findMany).toHaveBeenCalledWith({
        where: { ownerId: 'owner-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('remove', () => {
    it('throws NotFound for an unknown property', async () => {
      prisma.property.findUnique.mockResolvedValue(null);
      await expect(service.remove('missing', user(UserRole.ADMIN))).rejects.toThrow(NotFoundException);
    });

    it('forbids someone who is neither the owner nor an admin', async () => {
      prisma.property.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'owner-1' });
      await expect(service.remove('p1', user(UserRole.USER, 'stranger'))).rejects.toThrow(ForbiddenException);
      expect(prisma.property.update).not.toHaveBeenCalled();
    });

    it.each([
      ['the owner', UserRole.USER, 'owner-1'],
      ['an admin', UserRole.ADMIN, 'admin-1'],
    ])('soft-deletes for %s', async (_label, role, sub) => {
      prisma.property.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'owner-1' });
      prisma.property.update.mockResolvedValue({ id: 'p1', deleted: true });

      await service.remove('p1', user(role, sub));

      const args = prisma.property.update.mock.calls[0][0];
      expect(args.where).toEqual({ id: 'p1' });
      expect(args.data).toMatchObject({
        deleted: true,
        deletedById: sub,
        status: PropertyStatus.ARCHIVED,
      });
      expect(args.data.deletedAt).toBeInstanceOf(Date);
      expect(cache.invalidateByTag).toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('throws NotFound for an unknown property', async () => {
      prisma.property.findUnique.mockResolvedValue(null);
      await expect(service.restore('missing', user(UserRole.ADMIN))).rejects.toThrow(NotFoundException);
    });

    it('is admin-only, even for the owner', async () => {
      prisma.property.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'owner-1' });
      await expect(service.restore('p1', user(UserRole.USER, 'owner-1'))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('un-deletes the property as a draft and clears the deletion fields', async () => {
      prisma.property.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'owner-1' });
      prisma.property.update.mockResolvedValue({ id: 'p1' });

      await service.restore('p1', user(UserRole.ADMIN, 'admin-1'));

      expect(prisma.property.update.mock.calls[0][0].data).toEqual({
        deleted: false,
        deletedAt: null,
        deletedById: null,
        status: PropertyStatus.DRAFT,
      });
      expect(cache.invalidateByTag).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // searchProperties
  // ---------------------------------------------------------------------
  describe('searchProperties', () => {
    const page = (items: unknown[], total = items.length) => {
      prisma.$transaction.mockImplementation(
        ([rows, count]: [Promise<unknown>, Promise<unknown>]) => Promise.all([rows, count]),
      );
      prisma.property.findMany.mockResolvedValue(items);
      prisma.property.count.mockResolvedValue(total);
    };

    it('pages, orders and reports the total', async () => {
      page([{ id: 'p1', neighborhood: null }], 42);

      const result = await service.searchProperties({ page: 3, limit: 10 } as never);

      expect(prisma.property.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10, orderBy: { createdAt: 'desc' } }),
      );
      expect(prisma.property.count).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ total: 42, page: 3, limit: 10, totalPages: 5 });
      expect(result.items).toHaveLength(1);
    });

    it('defaults to page 1, 20 per page, newest first', async () => {
      page([]);

      const result = await service.searchProperties({} as never);

      expect(prisma.property.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20, orderBy: { createdAt: 'desc' } }),
      );
      expect(result).toMatchObject({ page: 1, limit: 20, total: 0 });
    });

    it('only ever returns ACTIVE, non-deleted listings', async () => {
      page([]);

      await service.searchProperties({ status: PropertyStatus.DRAFT } as never);

      expect(prisma.property.findMany.mock.calls[0][0].where).toMatchObject({
        deleted: false,
        status: PropertyStatus.ACTIVE,
      });
    });

    it('annotates each row with a computed neighborhood trust score', async () => {
      page([
        {
          id: 'p1',
          neighborhood: {
            walkScore: 80,
            transitScore: 60,
            bikeScore: 70,
            schoolRating: 9,
            crimeIndex: 10,
          },
        },
        { id: 'p2', neighborhood: null },
      ]);

      const result = await service.searchProperties({} as never);

      expect(result.items[0]).toMatchObject({ id: 'p1', neighborhoodTrustScore: 79 });
      expect(result.items[1]).toMatchObject({ id: 'p2', neighborhoodTrustScore: null });
    });

    it('filters in memory when a trust-score range is requested', async () => {
      page([
        { id: 'low', neighborhood: { walkScore: 10 } },
        { id: 'high', neighborhood: { walkScore: 95 } },
        { id: 'none', neighborhood: null },
      ]);

      const result = await service.searchProperties({ minNeighborhoodTrustScore: 50 } as never);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result.items.map((i: { id: string }) => i.id)).toEqual(['high']);
      expect(result.total).toBe(1);
    });

    it('rejects lat without lng', async () => {
      await expect(service.searchProperties({ lat: 30 } as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a radius with neither lat/lng nor a bounding box', async () => {
      await expect(service.searchProperties({ radiusKm: 5 } as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('turns a radius into a bounding box', async () => {
      page([]);
      await service.searchProperties({ lat: 30, lng: -97, radiusKm: 111 } as never);

      const where = prisma.property.findMany.mock.calls[0][0].where;
      expect(where.latitude).toEqual({ gte: 29, lte: 31 });
      expect(where.longitude).toEqual({ gte: -98, lte: -96 });
    });
  });

  // ---------------------------------------------------------------------
  // transitionStatus / approve / reject
  // ---------------------------------------------------------------------
  describe('transitionStatus', () => {
    beforeEach(() => {
      prisma.property.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'owner-1', status: 'DRAFT' });
      prisma.property.update.mockResolvedValue({ id: 'p1' });
    });

    it('throws NotFound for an unknown property', async () => {
      prisma.property.findUnique.mockResolvedValue(null);
      await expect(
        service.transitionStatus('missing', PropertyStatus.PENDING, 'owner-1', UserRole.USER),
      ).rejects.toThrow(NotFoundException);
    });

    it('forbids a caller who is neither owner, AGENT nor ADMIN', async () => {
      await expect(
        service.transitionStatus('p1', PropertyStatus.PENDING, 'stranger', UserRole.USER),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.property.update).not.toHaveBeenCalled();
    });

    it('rejects a transition the workflow does not allow', async () => {
      await expect(
        service.transitionStatus('p1', PropertyStatus.SOLD, 'owner-1', UserRole.USER),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.property.update).not.toHaveBeenCalled();
    });

    it('treats a transition to the current status as an idempotent no-op', async () => {
      await service.transitionStatus('p1', 'DRAFT' as PropertyStatus, 'owner-1', UserRole.USER);
      expect(prisma.property.update).not.toHaveBeenCalled();
    });

    it.each([
      ['the owner', UserRole.USER, 'owner-1'],
      ['an agent', UserRole.AGENT, 'agent-1'],
      ['an admin', UserRole.ADMIN, 'admin-1'],
    ])('lets %s move a listing forward', async (_label, role, sub) => {
      await service.transitionStatus('p1', PropertyStatus.PENDING, sub, role);
      expect(prisma.property.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { status: PropertyStatus.PENDING },
      });
    });

    it('approve goes to ACTIVE and reject to ARCHIVED', async () => {
      await service.approveProperty('p1', 'admin-1');
      expect(prisma.property.update).toHaveBeenLastCalledWith({
        where: { id: 'p1' },
        data: { status: PropertyStatus.ACTIVE },
      });

      await service.rejectProperty('p1', 'admin-1');
      expect(prisma.property.update).toHaveBeenLastCalledWith({
        where: { id: 'p1' },
        data: { status: PropertyStatus.ARCHIVED },
      });
    });
  });

  // ---------------------------------------------------------------------
  // bulk operations
  // ---------------------------------------------------------------------
  describe('bulk operations', () => {
    beforeEach(() => {
      prisma.property.updateMany.mockResolvedValue({ count: 2 });
      prisma.property.deleteMany.mockResolvedValue({ count: 1 });
      prisma.property.findMany.mockResolvedValue([]);
    });

    it.each(['DRAFT', 'ACTIVE', 'ARCHIVED'])(
      'bulk-updates to the supported status %s',
      async (status) => {
        const result = await service.bulkUpdatePropertyStatus(['p1', 'p2'], status as PropertyStatus);
        expect(prisma.property.updateMany).toHaveBeenCalledWith({
          where: { id: { in: ['p1', 'p2'] } },
          data: { status },
        });
        expect(result).toEqual({ updatedCount: 2 });
      },
    );

    it('rejects a bulk status the endpoint does not support instead of silently coercing it', async () => {
      // SOLD used to be coerced to ACTIVE, which silently published listings.
      await expect(service.bulkUpdatePropertyStatus(['p1'], PropertyStatus.SOLD)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.property.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an empty id list', async () => {
      await expect(service.bulkUpdatePropertyStatus([], PropertyStatus.ACTIVE)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.bulkDeleteProperties([])).rejects.toThrow(BadRequestException);
      expect(prisma.property.deleteMany).not.toHaveBeenCalled();
    });

    it('reports only the ids that actually existed', async () => {
      prisma.property.findMany.mockResolvedValue([{ id: 'p1' }]);

      const result = await service.bulkDeleteProperties(['p1', 'ghost']);

      expect(prisma.property.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['p1'] } } });
      expect(result).toEqual({ deletedCount: 1, propertyIds: ['p1'] });
    });

    it('does not touch the database when no id matches', async () => {
      const result = await service.bulkDeleteProperties(['ghost']);
      expect(prisma.property.deleteMany).not.toHaveBeenCalled();
      expect(result).toEqual({ deletedCount: 0, propertyIds: [] });
    });

    it('turns a foreign-key violation into a conflict instead of a 500', async () => {
      prisma.property.findMany.mockResolvedValue([{ id: 'p1' }]);
      prisma.property.deleteMany.mockRejectedValue(
        Object.assign(new Error('Foreign key constraint failed'), { code: 'P2003' }),
      );

      await expect(service.bulkDeleteProperties(['p1'])).rejects.toThrow(/cannot be deleted/);
    });
  });

  // ---------------------------------------------------------------------
  // agent assignment
  // ---------------------------------------------------------------------
  describe('agent assignment', () => {
    const agentDto = { agentId: 'agent-1' };

    beforeEach(() => {
      prisma.property.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'owner-1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'agent-1', role: 'AGENT' });
      prisma.propertyAgent.findUnique.mockResolvedValue(null);
    });

    it('refuses an agent assignment for an unknown property', async () => {
      prisma.property.findUnique.mockResolvedValue(null);
      await expect(
        service.assignAgent('missing', agentDto as never, user(UserRole.ADMIN)),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses an agent assignment from a caller who is not the owner or an admin', async () => {
      await expect(
        service.assignAgent('p1', agentDto as never, user(UserRole.USER, 'stranger')),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses an assignee without the AGENT role', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'agent-1', role: 'USER' });
      await expect(
        service.assignAgent('p1', agentDto as never, user(UserRole.ADMIN)),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.propertyAgent.create).not.toHaveBeenCalled();
    });

    it('refuses to assign the same agent twice', async () => {
      prisma.propertyAgent.findUnique.mockResolvedValue({ propertyId: 'p1', agentId: 'agent-1' });
      await expect(
        service.assignAgent('p1', agentDto as never, user(UserRole.ADMIN)),
      ).rejects.toThrow(/already assigned/);
    });

    it('defaults the commission to 3% and creates the assignment', async () => {
      prisma.propertyAgent.create.mockResolvedValue({ id: 'pa1' });
      await service.assignAgent('p1', agentDto as never, user(UserRole.ADMIN));

      expect(prisma.propertyAgent.create.mock.calls[0][0].data).toMatchObject({
        commissionRate: new Decimal('0.03'),
        contactPhone: null,
      });
    });

    it('reports a missing assignment as not found on update', async () => {
      prisma.propertyAgent.findUnique.mockResolvedValue(null);
      await expect(
        service.updateAgentAssignment('p1', 'agent-1', {} as never, user(UserRole.ADMIN)),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.propertyAgent.update).not.toHaveBeenCalled();
    });

    it('reports a missing assignment as not found on removal', async () => {
      prisma.propertyAgent.findUnique.mockResolvedValue(null);
      await expect(
        service.removeAgentAssignment('p1', 'agent-1', user(UserRole.ADMIN)),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.propertyAgent.delete).not.toHaveBeenCalled();
    });

    it('lists assignments and falls back to the agent contact details', async () => {
      prisma.propertyAgent.findMany.mockResolvedValue([
        {
          id: 'pa1',
          propertyId: 'p1',
          agentId: 'agent-1',
          commissionRate: new Decimal('0.03'),
          contactPhone: null,
          contactEmail: null,
          agent: { id: 'agent-1', phone: '555-0100', email: 'agent@example.com' },
        },
      ]);

      const result = await service.getAgents('p1');

      expect(result).toEqual([
        expect.objectContaining({
          commissionRate: 0.03,
          contactPhone: '555-0100',
          contactEmail: 'agent@example.com',
        }),
      ]);
    });
  });

  // ---------------------------------------------------------------------
  // amenities
  // ---------------------------------------------------------------------
  describe('amenities', () => {
    beforeEach(() => {
      prisma.property.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.propertyAmenity.findUnique.mockResolvedValue({ id: 'am1', propertyId: 'p1' });
    });

    it('reports an unknown property as not found', async () => {
      prisma.property.findUnique.mockResolvedValue(null);
      await expect(service.addAmenity('missing', {} as never)).rejects.toThrow(NotFoundException);
    });

    it('refuses to touch an amenity that belongs to another property', async () => {
      prisma.propertyAmenity.findUnique.mockResolvedValue({ id: 'am1', propertyId: 'other' });
      await expect(service.updateAmenity('p1', 'am1', {} as never)).rejects.toThrow(NotFoundException);
      await expect(service.removeAmenity('p1', 'am1')).rejects.toThrow(NotFoundException);
      expect(prisma.propertyAmenity.update).not.toHaveBeenCalled();
      expect(prisma.propertyAmenity.delete).not.toHaveBeenCalled();
    });

    it('defaults an amenity to available', async () => {
      prisma.propertyAmenity.create.mockResolvedValue({ id: 'am1' });
      await service.addAmenity('p1', { name: 'Pool', amenityType: 'OUTDOOR' } as never);

      expect(prisma.propertyAmenity.create.mock.calls[0][0].data).toMatchObject({
        propertyId: 'p1',
        isAvailable: true,
        description: null,
      });
    });

    it('lists amenities oldest first', async () => {
      prisma.propertyAmenity.findMany.mockResolvedValue([]);
      await service.getAmenities('p1');
      expect(prisma.propertyAmenity.findMany).toHaveBeenCalledWith({
        where: { propertyId: 'p1' },
        orderBy: { createdAt: 'asc' },
      });
    });
  });
});
