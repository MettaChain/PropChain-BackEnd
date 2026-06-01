import { Test, TestingModule } from '@nestjs/testing';
import { PriceHistoryService } from './price-history.service';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../cache/cache.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserRole, PropertyStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

describe('PriceHistoryService', () => {
  let service: PriceHistoryService;
  let prismaService: PrismaService;
  let cacheService: CacheService;
  let notificationsService: NotificationsService;

  const mockPrismaService = {
    priceHistory: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    property: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockCacheService = {
    invalidatePropertyCache: jest.fn(),
  };

  const mockNotificationsService = {
    sendNotification: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriceHistoryService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    }).compile();

    service = module.get<PriceHistoryService>(PriceHistoryService);
    prismaService = module.get<PrismaService>(PrismaService);
    cacheService = module.get<CacheService>(CacheService);
    notificationsService = module.get<NotificationsService>(NotificationsService);

    jest.clearAllMocks();
  });

  describe('recordPriceChange', () => {
    it('should record a price change with all fields', async () => {
      const propertyId = 'prop-123';
      const previousPrice = new Decimal('250000');
      const newPrice = new Decimal('255000');
      const userId = 'user-123';
      const userRole = UserRole.AGENT;
      const changeReason = 'Market adjustment';
      const metadata = { source: 'web' };
      const ipAddress = '192.168.1.1';
      const userAgent = 'Mozilla/5.0';

      const mockProperty = {
        id: propertyId,
        ownerId: 'owner-123',
        price: previousPrice,
        status: PropertyStatus.ACTIVE,
      };

      const mockCreatedRecord = {
        id: 'record-123',
        propertyId,
        previousPrice,
        newPrice,
        priceChangePercentage: new Decimal('2.00'),
        timestamp: new Date(),
        userId,
        userRole,
        changeReason,
        ipAddress,
        userAgent,
        metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);
      mockPrismaService.priceHistory.findFirst.mockResolvedValue(null);
      mockPrismaService.priceHistory.create.mockResolvedValue(mockCreatedRecord);
      mockPrismaService.property.update.mockResolvedValue(mockProperty);
      mockCacheService.invalidatePropertyCache.mockResolvedValue(undefined);
      mockNotificationsService.sendNotification.mockResolvedValue({});

      const result = await service.recordPriceChange(
        propertyId,
        previousPrice,
        newPrice,
        userId,
        userRole,
        changeReason,
        metadata,
        ipAddress,
        userAgent,
      );

      expect(result).toEqual(mockCreatedRecord);
      expect(mockPrismaService.priceHistory.create).toHaveBeenCalledWith({
        data: {
          propertyId,
          previousPrice,
          newPrice,
          priceChangePercentage: new Decimal('2.00'),
          userId,
          userRole,
          changeReason,
          ipAddress,
          userAgent,
          metadata,
        },
      });
      expect(mockPrismaService.property.update).toHaveBeenCalledWith({
        where: { id: propertyId },
        data: { price: newPrice },
      });
      expect(mockCacheService.invalidatePropertyCache).toHaveBeenCalledWith(propertyId);
      expect(mockNotificationsService.sendNotification).toHaveBeenCalled();
    });

    it('should reject negative new price', async () => {
      const propertyId = 'prop-123';
      const previousPrice = new Decimal('250000');
      const newPrice = new Decimal('-100');
      const userId = 'user-123';
      const userRole = UserRole.AGENT;

      await expect(
        service.recordPriceChange(propertyId, previousPrice, newPrice, userId, userRole),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject zero new price', async () => {
      const propertyId = 'prop-123';
      const previousPrice = new Decimal('250000');
      const newPrice = new Decimal('0');
      const userId = 'user-123';
      const userRole = UserRole.AGENT;

      await expect(
        service.recordPriceChange(propertyId, previousPrice, newPrice, userId, userRole),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if property does not exist', async () => {
      const propertyId = 'prop-nonexistent';
      const previousPrice = new Decimal('250000');
      const newPrice = new Decimal('255000');
      const userId = 'user-123';
      const userRole = UserRole.AGENT;

      mockPrismaService.property.findUnique.mockResolvedValue(null);

      await expect(
        service.recordPriceChange(propertyId, previousPrice, newPrice, userId, userRole),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject if previous price does not match last recorded price', async () => {
      const propertyId = 'prop-123';
      const previousPrice = new Decimal('250000');
      const newPrice = new Decimal('255000');
      const userId = 'user-123';
      const userRole = UserRole.AGENT;

      const mockProperty = {
        id: propertyId,
        ownerId: 'owner-123',
        price: previousPrice,
        status: PropertyStatus.ACTIVE,
      };

      const mockLastRecord = {
        id: 'record-122',
        propertyId,
        previousPrice: new Decimal('240000'),
        newPrice: new Decimal('250000'),
        priceChangePercentage: new Decimal('4.17'),
        timestamp: new Date(),
        userId: 'user-122',
        userRole: UserRole.AGENT,
        changeReason: 'Previous change',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);
      mockPrismaService.priceHistory.findFirst.mockResolvedValue(mockLastRecord);

      await expect(
        service.recordPriceChange(propertyId, previousPrice, newPrice, userId, userRole),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow recording when previous price matches last recorded price', async () => {
      const propertyId = 'prop-123';
      const previousPrice = new Decimal('250000');
      const newPrice = new Decimal('255000');
      const userId = 'user-123';
      const userRole = UserRole.AGENT;

      const mockProperty = {
        id: propertyId,
        ownerId: 'owner-123',
        price: previousPrice,
        status: PropertyStatus.ACTIVE,
      };

      const mockLastRecord = {
        id: 'record-122',
        propertyId,
        previousPrice: new Decimal('240000'),
        newPrice: previousPrice, // Matches previousPrice parameter
        priceChangePercentage: new Decimal('4.17'),
        timestamp: new Date(),
        userId: 'user-122',
        userRole: UserRole.AGENT,
        changeReason: 'Previous change',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockCreatedRecord = {
        id: 'record-123',
        propertyId,
        previousPrice,
        newPrice,
        priceChangePercentage: new Decimal('2.00'),
        timestamp: new Date(),
        userId,
        userRole,
        changeReason: undefined,
        ipAddress: undefined,
        userAgent: undefined,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);
      mockPrismaService.priceHistory.findFirst.mockResolvedValue(mockLastRecord);
      mockPrismaService.priceHistory.create.mockResolvedValue(mockCreatedRecord);
      mockPrismaService.property.update.mockResolvedValue(mockProperty);
      mockCacheService.invalidatePropertyCache.mockResolvedValue(undefined);
      mockNotificationsService.sendNotification.mockResolvedValue({});

      const result = await service.recordPriceChange(
        propertyId,
        previousPrice,
        newPrice,
        userId,
        userRole,
      );

      expect(result).toEqual(mockCreatedRecord);
    });

    it('should allow recording when no previous records exist', async () => {
      const propertyId = 'prop-123';
      const previousPrice = new Decimal('250000');
      const newPrice = new Decimal('255000');
      const userId = 'user-123';
      const userRole = UserRole.AGENT;

      const mockProperty = {
        id: propertyId,
        ownerId: 'owner-123',
        price: previousPrice,
        status: PropertyStatus.ACTIVE,
      };

      const mockCreatedRecord = {
        id: 'record-123',
        propertyId,
        previousPrice,
        newPrice,
        priceChangePercentage: new Decimal('2.00'),
        timestamp: new Date(),
        userId,
        userRole,
        changeReason: undefined,
        ipAddress: undefined,
        userAgent: undefined,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);
      mockPrismaService.priceHistory.findFirst.mockResolvedValue(null);
      mockPrismaService.priceHistory.create.mockResolvedValue(mockCreatedRecord);
      mockPrismaService.property.update.mockResolvedValue(mockProperty);
      mockCacheService.invalidatePropertyCache.mockResolvedValue(undefined);
      mockNotificationsService.sendNotification.mockResolvedValue({});

      const result = await service.recordPriceChange(
        propertyId,
        previousPrice,
        newPrice,
        userId,
        userRole,
      );

      expect(result).toEqual(mockCreatedRecord);
    });
  });

  describe('calculatePercentageChange', () => {
    it('should calculate percentage change correctly', () => {
      const previousPrice = new Decimal('250000');
      const newPrice = new Decimal('255000');

      const result = service.calculatePercentageChange(previousPrice, newPrice);

      expect(result).toEqual(new Decimal('2.00'));
    });

    it('should round to 2 decimal places', () => {
      const previousPrice = new Decimal('100');
      const newPrice = new Decimal('133.33');

      const result = service.calculatePercentageChange(previousPrice, newPrice);

      expect(result).toEqual(new Decimal('33.33'));
    });

    it('should handle negative percentage change', () => {
      const previousPrice = new Decimal('300000');
      const newPrice = new Decimal('270000');

      const result = service.calculatePercentageChange(previousPrice, newPrice);

      expect(result).toEqual(new Decimal('-10.00'));
    });

    it('should return null when previousPrice is zero', () => {
      const previousPrice = new Decimal('0');
      const newPrice = new Decimal('255000');

      const result = service.calculatePercentageChange(previousPrice, newPrice);

      expect(result).toBeNull();
    });

    it('should return null when previousPrice is null', () => {
      const previousPrice = null;
      const newPrice = new Decimal('255000');

      const result = service.calculatePercentageChange(previousPrice, newPrice);

      expect(result).toBeNull();
    });

    it('should handle zero percentage change', () => {
      const previousPrice = new Decimal('250000');
      const newPrice = new Decimal('250000');

      const result = service.calculatePercentageChange(previousPrice, newPrice);

      expect(result).toEqual(new Decimal('0.00'));
    });
  });

  describe('getPriceHistory', () => {
    it('should retrieve price history with pagination', async () => {
      const propertyId = 'prop-123';
      const limit = 50;
      const offset = 0;

      const mockProperty = {
        id: propertyId,
        ownerId: 'owner-123',
        price: new Decimal('255000'),
        status: PropertyStatus.ACTIVE,
      };

      const mockRecords = [
        {
          id: 'record-1',
          propertyId,
          previousPrice: new Decimal('250000'),
          newPrice: new Decimal('255000'),
          priceChangePercentage: new Decimal('2.00'),
          timestamp: new Date('2024-01-15'),
          userId: 'user-123',
          userRole: UserRole.AGENT,
          changeReason: 'Market adjustment',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);
      mockPrismaService.priceHistory.findMany.mockResolvedValue(mockRecords);
      mockPrismaService.priceHistory.count.mockResolvedValue(1);

      const result = await service.getPriceHistory(propertyId, limit, offset);

      expect(result.data).toEqual(mockRecords);
      expect(result.total).toBe(1);
      expect(mockPrismaService.priceHistory.findMany).toHaveBeenCalledWith({
        where: { propertyId },
        orderBy: { timestamp: 'DESC' },
        take: limit,
        skip: offset,
      });
    });

    it('should apply date range filtering', async () => {
      const propertyId = 'prop-123';
      const limit = 50;
      const offset = 0;
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const mockProperty = {
        id: propertyId,
        ownerId: 'owner-123',
        price: new Decimal('255000'),
        status: PropertyStatus.ACTIVE,
      };

      mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);
      mockPrismaService.priceHistory.findMany.mockResolvedValue([]);
      mockPrismaService.priceHistory.count.mockResolvedValue(0);

      await service.getPriceHistory(propertyId, limit, offset, startDate, endDate);

      expect(mockPrismaService.priceHistory.findMany).toHaveBeenCalledWith({
        where: {
          propertyId,
          timestamp: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { timestamp: 'DESC' },
        take: limit,
        skip: offset,
      });
    });

    it('should sort by price field', async () => {
      const propertyId = 'prop-123';
      const limit = 50;
      const offset = 0;
      const sortBy = 'price';
      const sortOrder = 'ASC' as const;

      const mockProperty = {
        id: propertyId,
        ownerId: 'owner-123',
        price: new Decimal('255000'),
        status: PropertyStatus.ACTIVE,
      };

      mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);
      mockPrismaService.priceHistory.findMany.mockResolvedValue([]);
      mockPrismaService.priceHistory.count.mockResolvedValue(0);

      await service.getPriceHistory(propertyId, limit, offset, undefined, undefined, sortBy, sortOrder);

      expect(mockPrismaService.priceHistory.findMany).toHaveBeenCalledWith({
        where: { propertyId },
        orderBy: { newPrice: sortOrder },
        take: limit,
        skip: offset,
      });
    });

    it('should sort by percentage_change field', async () => {
      const propertyId = 'prop-123';
      const limit = 50;
      const offset = 0;
      const sortBy = 'percentage_change';
      const sortOrder = 'DESC' as const;

      const mockProperty = {
        id: propertyId,
        ownerId: 'owner-123',
        price: new Decimal('255000'),
        status: PropertyStatus.ACTIVE,
      };

      mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);
      mockPrismaService.priceHistory.findMany.mockResolvedValue([]);
      mockPrismaService.priceHistory.count.mockResolvedValue(0);

      await service.getPriceHistory(propertyId, limit, offset, undefined, undefined, sortBy, sortOrder);

      expect(mockPrismaService.priceHistory.findMany).toHaveBeenCalledWith({
        where: { propertyId },
        orderBy: { priceChangePercentage: sortOrder },
        take: limit,
        skip: offset,
      });
    });

    it('should throw NotFoundException if property does not exist', async () => {
      const propertyId = 'prop-nonexistent';

      mockPrismaService.property.findUnique.mockResolvedValue(null);

      await expect(service.getPriceHistory(propertyId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('checkPermission', () => {
    it('should grant access to ADMIN users', async () => {
      const userId = 'user-123';
      const userRole = UserRole.ADMIN;
      const propertyId = 'prop-123';

      const result = await service.checkPermission(userId, userRole, propertyId);

      expect(result).toBe(true);
    });

    it('should grant access to property owner', async () => {
      const userId = 'user-123';
      const userRole = UserRole.USER;
      const propertyId = 'prop-123';

      const mockProperty = {
        id: propertyId,
        ownerId: userId,
        price: new Decimal('255000'),
        status: PropertyStatus.DRAFT,
      };

      mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);

      const result = await service.checkPermission(userId, userRole, propertyId);

      expect(result).toBe(true);
    });

    it('should grant access to ACTIVE property for any user', async () => {
      const userId = 'user-123';
      const userRole = UserRole.USER;
      const propertyId = 'prop-123';

      const mockProperty = {
        id: propertyId,
        ownerId: 'owner-456',
        price: new Decimal('255000'),
        status: PropertyStatus.ACTIVE,
      };

      mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);

      const result = await service.checkPermission(userId, userRole, propertyId);

      expect(result).toBe(true);
    });

    it('should deny access to non-owner for non-ACTIVE property', async () => {
      const userId = 'user-123';
      const userRole = UserRole.USER;
      const propertyId = 'prop-123';

      const mockProperty = {
        id: propertyId,
        ownerId: 'owner-456',
        price: new Decimal('255000'),
        status: PropertyStatus.DRAFT,
      };

      mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);

      const result = await service.checkPermission(userId, userRole, propertyId);

      expect(result).toBe(false);
    });

    it('should return false if property does not exist', async () => {
      const userId = 'user-123';
      const userRole = UserRole.USER;
      const propertyId = 'prop-nonexistent';

      mockPrismaService.property.findUnique.mockResolvedValue(null);

      const result = await service.checkPermission(userId, userRole, propertyId);

      expect(result).toBe(false);
    });

    it('should grant AGENT access to ACTIVE property', async () => {
      const userId = 'user-123';
      const userRole = UserRole.AGENT;
      const propertyId = 'prop-123';

      const mockProperty = {
        id: propertyId,
        ownerId: 'owner-456',
        price: new Decimal('255000'),
        status: PropertyStatus.ACTIVE,
      };

      mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);

      const result = await service.checkPermission(userId, userRole, propertyId);

      expect(result).toBe(true);
    });
  });
});


  describe('getChartData', () => {
    it('should return chart data with daily aggregation', async () => {
      const propertyId = 'prop-123';
      const interval = 'daily';

      const mockProperty = {
        id: propertyId,
        address: '123 Main St, Springfield, IL 62701',
        price: new Decimal('255000'),
      };

      const mockRecords = [
        {
          id: 'record-1',
          propertyId,
          previousPrice: new Decimal('250000'),
          newPrice: new Decimal('252000'),
          priceChangePercentage: new Decimal('0.80'),
          timestamp: new Date('2024-01-15T10:00:00Z'),
          userId: 'user-123',
          userRole: UserRole.AGENT,
          changeReason: 'Market adjustment',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'record-2',
          propertyId,
          previousPrice: new Decimal('252000'),
          newPrice: new Decimal('255000'),
          priceChangePercentage: new Decimal('1.19'),
          timestamp: new Date('2024-01-15T14:00:00Z'),
          userId: 'user-124',
          userRole: UserRole.AGENT,
          changeReason: 'Price increase',
          ipAddress: '192.168.1.2',
          userAgent: 'Mozilla/5.0',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);
      mockPrismaService.priceHistory.findMany.mockResolvedValue(mockRecords);

      const result = await service.getChartData(propertyId, interval);

      expect(result.propertyId).toBe(propertyId);
      expect(result.propertyAddress).toBe(mockProperty.address);
      expect(result.currentPrice).toEqual(mockProperty.price);
      expect(result.aggregationInterval).toBe(interval);
      expect(result.dataPoints.length).toBeGreaterThan(0);
      expect(result.dataPoints[0]).toHaveProperty('timestamp');
      expect(result.dataPoints[0]).toHaveProperty('price');
      expect(result.dataPoints[0]).toHaveProperty('previousPrice');
      expect(result.dataPoints[0]).toHaveProperty('priceChangePercentage');
      expect(result.dataPoints[0]).toHaveProperty('changeReason');
      expect(result.dataPoints[0]).toHaveProperty('minPrice');
      expect(result.dataPoints[0]).toHaveProperty('maxPrice');
      expect(result.dataPoints[0]).toHaveProperty('firstPrice');
      expect(result.dataPoints[0]).toHaveProperty('lastPrice');
    });

    it('should return empty dataPoints when no records exist', async () => {
      const propertyId = 'prop-123';
      const interval = 'daily';

      const mockProperty = {
        id: propertyId,
        address: '123 Main St, Springfield, IL 62701',
        price: new Decimal('255000'),
      };

      mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);
      mockPrismaService.priceHistory.findMany.mockResolvedValue([]);

      const result = await service.getChartData(propertyId, interval);

      expect(result.dataPoints).toEqual([]);
      expect(result.propertyId).toBe(propertyId);
    });

    it('should throw NotFoundException if property does not exist', async () => {
      const propertyId = 'prop-nonexistent';
      const interval = 'daily';

      mockPrismaService.property.findUnique.mockResolvedValue(null);

      await expect(service.getChartData(propertyId, interval)).rejects.toThrow(NotFoundException);
    });

    it('should apply date range filtering', async () => {
      const propertyId = 'prop-123';
      const interval = 'daily';
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const mockProperty = {
        id: propertyId,
        address: '123 Main St, Springfield, IL 62701',
        price: new Decimal('255000'),
      };

      mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);
      mockPrismaService.priceHistory.findMany.mockResolvedValue([]);

      await service.getChartData(propertyId, interval, startDate, endDate);

      expect(mockPrismaService.priceHistory.findMany).toHaveBeenCalledWith({
        where: {
          propertyId,
          timestamp: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { timestamp: 'asc' },
      });
    });
  });

  describe('exportData', () => {
    it('should export data as JSON', async () => {
      const propertyId = 'prop-123';
      const format = 'json';

      const mockProperty = {
        id: propertyId,
        address: '123 Main St, Springfield, IL 62701',
      };

      const mockRecords = [
        {
          id: 'record-1',
          propertyId,
          previousPrice: new Decimal('250000'),
          newPrice: new Decimal('255000'),
          priceChangePercentage: new Decimal('2.00'),
          timestamp: new Date('2024-01-15'),
          userId: 'user-123',
          userRole: UserRole.AGENT,
          changeReason: 'Market adjustment',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          metadata: { source: 'web' },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);
      mockPrismaService.priceHistory.findMany.mockResolvedValue(mockRecords);

      const result = await service.exportData(propertyId, format);

      expect(result).toBeInstanceOf(Buffer);
      const jsonData = JSON.parse(result.toString('utf-8'));
      expect(jsonData).toHaveProperty('metadata');
      expect(jsonData).toHaveProperty('records');
      expect(jsonData.metadata).toHaveProperty('propertyAddress');
      expect(jsonData.metadata).toHaveProperty('exportDate');
      expect(jsonData.metadata).toHaveProperty('recordCount');
      expect(jsonData.records.length).toBe(1);
    });

    it('should export data as CSV', async () => {
      const propertyId = 'prop-123';
      const format = 'csv';

      const mockProperty = {
        id: propertyId,
        address: '123 Main St, Springfield, IL 62701',
      };

      const mockRecords = [
        {
          id: 'record-1',
          propertyId,
          previousPrice: new Decimal('250000'),
          newPrice: new Decimal('255000'),
          priceChangePercentage: new Decimal('2.00'),
          timestamp: new Date('2024-01-15'),
          userId: 'user-123',
          userRole: UserRole.AGENT,
          changeReason: 'Market adjustment',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          metadata: { source: 'web' },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);
      mockPrismaService.priceHistory.findMany.mockResolvedValue(mockRecords);

      const result = await service.exportData(propertyId, format);

      expect(result).toBeInstanceOf(Buffer);
      const csvContent = result.toString('utf-8');
      expect(csvContent).toContain('Property Address');
      expect(csvContent).toContain('Export Date');
      expect(csvContent).toContain('Timestamp');
      expect(csvContent).toContain('Previous Price');
      expect(csvContent).toContain('New Price');
    });

    it('should throw NotFoundException if property does not exist', async () => {
      const propertyId = 'prop-nonexistent';
      const format = 'json';

      mockPrismaService.property.findUnique.mockResolvedValue(null);

      await expect(service.exportData(propertyId, format)).rejects.toThrow(NotFoundException);
    });

    it('should apply date range filtering for export', async () => {
      const propertyId = 'prop-123';
      const format = 'json';
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const mockProperty = {
        id: propertyId,
        address: '123 Main St, Springfield, IL 62701',
      };

      mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);
      mockPrismaService.priceHistory.findMany.mockResolvedValue([]);

      await service.exportData(propertyId, format, startDate, endDate);

      expect(mockPrismaService.priceHistory.findMany).toHaveBeenCalledWith({
        where: {
          propertyId,
          timestamp: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { timestamp: 'asc' },
      });
    });
  });

  describe('bulkExport', () => {
    it('should export data for multiple properties as JSON', async () => {
      const propertyIds = ['prop-1', 'prop-2'];
      const userId = 'user-123';
      const userRole = UserRole.ADMIN;
      const format = 'json';

      const mockProperty1 = {
        id: 'prop-1',
        ownerId: 'owner-1',
        status: PropertyStatus.ACTIVE,
        address: '123 Main St',
      };

      const mockProperty2 = {
        id: 'prop-2',
        ownerId: 'owner-2',
        status: PropertyStatus.ACTIVE,
        address: '456 Oak Ave',
      };

      const mockRecords = [
        {
          id: 'record-1',
          propertyId: 'prop-1',
          previousPrice: new Decimal('250000'),
          newPrice: new Decimal('255000'),
          priceChangePercentage: new Decimal('2.00'),
          timestamp: new Date('2024-01-15'),
          userId: 'user-123',
          userRole: UserRole.AGENT,
          changeReason: 'Market adjustment',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          property: { address: '123 Main St' },
        },
        {
          id: 'record-2',
          propertyId: 'prop-2',
          previousPrice: new Decimal('300000'),
          newPrice: new Decimal('310000'),
          priceChangePercentage: new Decimal('3.33'),
          timestamp: new Date('2024-01-16'),
          userId: 'user-124',
          userRole: UserRole.AGENT,
          changeReason: 'Price increase',
          ipAddress: '192.168.1.2',
          userAgent: 'Mozilla/5.0',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          property: { address: '456 Oak Ave' },
        },
      ];

      mockPrismaService.property.findUnique
        .mockResolvedValueOnce(mockProperty1)
        .mockResolvedValueOnce(mockProperty2);
      mockPrismaService.priceHistory.findMany.mockResolvedValue(mockRecords);

      const result = await service.bulkExport(propertyIds, userId, userRole, format);

      expect(result).toBeInstanceOf(Buffer);
      const jsonData = JSON.parse(result.toString('utf-8'));
      expect(jsonData).toHaveProperty('metadata');
      expect(jsonData).toHaveProperty('properties');
      expect(jsonData.metadata).toHaveProperty('exportDate');
      expect(jsonData.metadata).toHaveProperty('totalRecords');
      expect(jsonData.metadata).toHaveProperty('propertyCount');
    });

    it('should export data for multiple properties as CSV', async () => {
      const propertyIds = ['prop-1', 'prop-2'];
      const userId = 'user-123';
      const userRole = UserRole.ADMIN;
      const format = 'csv';

      const mockProperty1 = {
        id: 'prop-1',
        ownerId: 'owner-1',
        status: PropertyStatus.ACTIVE,
        address: '123 Main St',
      };

      const mockProperty2 = {
        id: 'prop-2',
        ownerId: 'owner-2',
        status: PropertyStatus.ACTIVE,
        address: '456 Oak Ave',
      };

      const mockRecords = [
        {
          id: 'record-1',
          propertyId: 'prop-1',
          previousPrice: new Decimal('250000'),
          newPrice: new Decimal('255000'),
          priceChangePercentage: new Decimal('2.00'),
          timestamp: new Date('2024-01-15'),
          userId: 'user-123',
          userRole: UserRole.AGENT,
          changeReason: 'Market adjustment',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          property: { address: '123 Main St' },
        },
      ];

      mockPrismaService.property.findUnique
        .mockResolvedValueOnce(mockProperty1)
        .mockResolvedValueOnce(mockProperty2);
      mockPrismaService.priceHistory.findMany.mockResolvedValue(mockRecords);

      const result = await service.bulkExport(propertyIds, userId, userRole, format);

      expect(result).toBeInstanceOf(Buffer);
      const csvContent = result.toString('utf-8');
      expect(csvContent).toContain('Bulk Price History Export');
      expect(csvContent).toContain('Export Date');
      expect(csvContent).toContain('Total Records');
      expect(csvContent).toContain('Property ID');
      expect(csvContent).toContain('Property Address');
    });

    it('should throw BadRequestException if user lacks permission for any property', async () => {
      const propertyIds = ['prop-1', 'prop-2'];
      const userId = 'user-123';
      const userRole = UserRole.USER;
      const format = 'json';

      const mockProperty1 = {
        id: 'prop-1',
        ownerId: 'owner-1',
        status: PropertyStatus.DRAFT,
        address: '123 Main St',
      };

      const mockProperty2 = {
        id: 'prop-2',
        ownerId: 'owner-2',
        status: PropertyStatus.ACTIVE,
        address: '456 Oak Ave',
      };

      mockPrismaService.property.findUnique
        .mockResolvedValueOnce(mockProperty1)
        .mockResolvedValueOnce(mockProperty2);

      await expect(service.bulkExport(propertyIds, userId, userRole, format)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow bulk export when user is ADMIN', async () => {
      const propertyIds = ['prop-1', 'prop-2'];
      const userId = 'user-123';
      const userRole = UserRole.ADMIN;
      const format = 'json';

      const mockProperty1 = {
        id: 'prop-1',
        ownerId: 'owner-1',
        status: PropertyStatus.DRAFT,
        address: '123 Main St',
      };

      const mockProperty2 = {
        id: 'prop-2',
        ownerId: 'owner-2',
        status: PropertyStatus.DRAFT,
        address: '456 Oak Ave',
      };

      const mockRecords = [
        {
          id: 'record-1',
          propertyId: 'prop-1',
          previousPrice: new Decimal('250000'),
          newPrice: new Decimal('255000'),
          priceChangePercentage: new Decimal('2.00'),
          timestamp: new Date('2024-01-15'),
          userId: 'user-123',
          userRole: UserRole.AGENT,
          changeReason: 'Market adjustment',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          property: { address: '123 Main St' },
        },
      ];

      mockPrismaService.property.findUnique
        .mockResolvedValueOnce(mockProperty1)
        .mockResolvedValueOnce(mockProperty2);
      mockPrismaService.priceHistory.findMany.mockResolvedValue(mockRecords);

      const result = await service.bulkExport(propertyIds, userId, userRole, format);

      expect(result).toBeInstanceOf(Buffer);
    });

    it('should apply date range filtering for bulk export', async () => {
      const propertyIds = ['prop-1'];
      const userId = 'user-123';
      const userRole = UserRole.ADMIN;
      const format = 'json';
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const mockProperty = {
        id: 'prop-1',
        ownerId: 'owner-1',
        status: PropertyStatus.ACTIVE,
        address: '123 Main St',
      };

      mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);
      mockPrismaService.priceHistory.findMany.mockResolvedValue([]);

      await service.bulkExport(propertyIds, userId, userRole, format, startDate, endDate);

      expect(mockPrismaService.priceHistory.findMany).toHaveBeenCalledWith({
        where: {
          propertyId: { in: propertyIds },
          timestamp: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: [{ propertyId: 'asc' }, { timestamp: 'asc' }],
        include: { property: { select: { address: true } } },
      });
    });
  });
});
