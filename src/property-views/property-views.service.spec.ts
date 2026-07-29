import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PropertyViewsService } from './property-views.service';
import { PrismaService } from '../database/prisma.service';

describe('PropertyViewsService', () => {
  let service: PropertyViewsService;
  let prisma: {
    property: { findUnique: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    propertyView: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
      findFirst: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      property: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      propertyView: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PropertyViewsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<PropertyViewsService>(PropertyViewsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordView', () => {
    it('should throw NotFoundException for non-existent property', async () => {
      prisma.property.findUnique.mockResolvedValue(null);

      await expect(service.recordView('non-existent', { ipAddress: '127.0.0.1' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should create a view and increment view count', async () => {
      prisma.property.findUnique.mockResolvedValue({ id: 'prop-1' });
      prisma.$transaction.mockResolvedValue([
        { id: 'view-1', propertyId: 'prop-1' },
        { id: 'prop-1', viewCount: 1 },
      ]);

      const result = await service.recordView('prop-1', {
        userId: 'user-1',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        referrer: 'https://google.com',
        sessionId: 'sess-1',
      });

      expect(result.view).toBeDefined();
      expect(result.viewCount).toBe(1);
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('getViewCount', () => {
    it('should throw NotFoundException for non-existent property', async () => {
      prisma.property.findUnique.mockResolvedValue(null);

      await expect(service.getViewCount('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should return the view count', async () => {
      prisma.property.findUnique.mockResolvedValue({ viewCount: 42 });

      const count = await service.getViewCount('prop-1');

      expect(count).toBe(42);
    });
  });

  describe('getUniqueVisitorCount', () => {
    it('should return unique visitor counts', async () => {
      prisma.propertyView.groupBy
        .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }])
        .mockResolvedValueOnce([
          { ipAddress: '1.1.1.1' },
          { ipAddress: '2.2.2.2' },
          { ipAddress: '3.3.3.3' },
        ]);

      const result = await service.getUniqueVisitorCount('prop-1');

      expect(result.total).toBe(5);
      expect(result.authenticatedUsers).toBe(2);
      expect(result.anonymousIps).toBe(3);
    });

    it('should filter by since date when provided', async () => {
      prisma.propertyView.groupBy
        .mockResolvedValueOnce([{ userId: 'u1' }])
        .mockResolvedValueOnce([]);

      const since = new Date('2026-01-01');
      const result = await service.getUniqueVisitorCount('prop-1', since);

      expect(result.total).toBe(1);
      expect(result.authenticatedUsers).toBe(1);
      expect(result.anonymousIps).toBe(0);
    });
  });

  describe('getViewHistory', () => {
    it('should return paginated view history', async () => {
      prisma.$transaction.mockResolvedValue([
        [
          {
            id: 'v1',
            propertyId: 'prop-1',
            viewedAt: new Date(),
            user: { id: 'u1', firstName: 'Test', lastName: 'User', email: 'test@example.com' },
          },
        ],
        1,
      ]);

      const result = await service.getViewHistory('prop-1', { skip: 0, take: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.skip).toBe(0);
      expect(result.take).toBe(20);
    });

    it('should use default pagination params', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      const result = await service.getViewHistory('prop-1');

      expect(result.skip).toBe(0);
      expect(result.take).toBe(20);
    });
  });

  describe('getPopularProperties', () => {
    it('should return empty array when no views exist', async () => {
      prisma.property.findMany.mockResolvedValue([]);

      const result = await service.getPopularProperties({ take: 10 });

      expect(result).toEqual([]);
    });

    it('should return properties with view counts (no since)', async () => {
      const properties = [
        {
          id: 'p1',
          viewCount: 100,
          owner: { id: 'o1', firstName: 'A', lastName: 'B', email: 'a@b.com' },
        },
      ];
      prisma.property.findMany.mockResolvedValue(properties);

      const result = await service.getPopularProperties({ take: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].property.id).toBe('p1');
      expect(result[0].viewsInWindow).toBe(100);
    });

    it('should return popular properties grouped by views when since is provided', async () => {
      prisma.propertyView.groupBy.mockResolvedValue([
        { propertyId: 'p1', _count: { propertyId: 5 } },
      ]);
      prisma.property.findMany.mockResolvedValue([
        {
          id: 'p1',
          viewCount: 50,
          owner: { id: 'o1', firstName: 'A', lastName: 'B', email: 'a@b.com' },
        },
      ]);

      const result = await service.getPopularProperties({
        take: 10,
        since: new Date('2026-01-01'),
      });

      expect(result).toHaveLength(1);
      expect(result[0].viewsInWindow).toBe(5);
    });

    it('should return empty when no grouped results match', async () => {
      prisma.propertyView.groupBy.mockResolvedValue([
        { propertyId: 'p-missing', _count: { propertyId: 1 } },
      ]);
      prisma.property.findMany.mockResolvedValue([]);

      const result = await service.getPopularProperties({
        take: 10,
        since: new Date('2026-01-01'),
      });

      expect(result).toEqual([]);
    });
  });
});
