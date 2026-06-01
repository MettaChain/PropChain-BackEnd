import { Test, TestingModule } from '@nestjs/testing';
import { Decimal } from '@prisma/client/runtime/library';
import { PropertiesService } from './properties.service';
import { PrismaService } from '../database/prisma.service';
import { FraudService } from '../fraud/fraud.service';
import { CreatePropertyDto } from './dto/property.dto';
import { PropertyStatus, UserRole } from '../types/prisma.types';
import { GeocodingService } from './geocoding.service';

describe('PropertiesService', () => {
  let service: PropertiesService;
  let prisma: PrismaService;
  let fraudService: FraudService;

  const mockProperty = {
    id: 'prop-123',
    title: 'Beautiful Beach Condo',
    address: '123 Beach Ave',
    city: 'Miami',
    state: 'FL',
    zipCode: '33101',
    price: new Decimal('450000'),
    propertyType: 'Condo',
    status: 'PENDING',
    ownerId: 'user-123',
    hoaName: 'Beachside HOA',
    hoaMonthlyFee: new Decimal('325.5'),
    hoaAmenities: ['Pool', 'Gym'],
    hoaContactInfo: 'hoa@example.com',
  };

  const mockPrismaService = {
    property: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockFraudService = {
    evaluatePropertyCreated: jest.fn(),
  };

  const mockGeocodingService = {
    geocodeAddress: jest.fn(),
    hasAddressChanged: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.property.create.mockResolvedValue(mockProperty);
    mockPrismaService.property.findFirst.mockResolvedValue(null);
    mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);
    mockPrismaService.property.update.mockResolvedValue(mockProperty);
    mockPrismaService.$transaction.mockResolvedValue([[mockProperty], 1]);
    mockFraudService.evaluatePropertyCreated.mockResolvedValue(null);
    mockGeocodingService.geocodeAddress.mockResolvedValue(null);
    mockGeocodingService.hasAddressChanged.mockReturnValue(false);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropertiesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: FraudService, useValue: mockFraudService },
        { provide: GeocodingService, useValue: mockGeocodingService },
      ],
    }).compile();

    service = module.get<PropertiesService>(PropertiesService);
    prisma = module.get<PrismaService>(PrismaService);
    fraudService = module.get<FraudService>(FraudService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should successfully create property listing and run fraud evaluation', async () => {
      const createDto: CreatePropertyDto = {
        title: 'Beautiful Beach Condo',
        address: '123 Beach Ave',
        city: 'Miami',
        state: 'FL',
        zipCode: '33101',
        price: 450000,
        propertyType: 'Condo',
        hoaName: 'Beachside HOA',
        hoaMonthlyFee: 325.5,
        hoaAmenities: ['Pool', 'Gym'],
        hoaContactInfo: 'hoa@example.com',
      };

      const result = await service.create(createDto, 'user-123');

      expect(result).toBeDefined();
      expect(result.id).toBe('prop-123');
      expect(result.status).toBe('PENDING');
      expect(prisma.property.create).toHaveBeenCalledWith({
        data: {
          title: 'Beautiful Beach Condo',
          address: '123 Beach Ave',
          city: 'Miami',
          state: 'FL',
          zipCode: '33101',
          price: new Decimal('450000'),
          propertyType: 'Condo',
          hoaName: 'Beachside HOA',
          hoaMonthlyFee: new Decimal('325.5'),
          hoaAmenities: ['Pool', 'Gym'],
          hoaContactInfo: 'hoa@example.com',
          squareFeet: null,
          lotSize: null,
          status: 'PENDING',
          latitude: undefined,
          longitude: undefined,
          owner: {
            connect: { id: 'user-123' },
          },
        },
      });
      expect(fraudService.evaluatePropertyCreated).toHaveBeenCalledWith('prop-123');
    });
  });

  describe('findAll', () => {
    it('should default to active listings when no filter is provided', async () => {
      mockPrismaService.property.findMany.mockResolvedValue([mockProperty]);

      await service.findAll();

      expect(prisma.property.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'ACTIVE' },
        }),
      );
    });
  });

  describe('searchProperties', () => {
    it('should only search approved listings by default', async () => {
      const mockActiveProperty = {
        id: 'active-1',
        title: 'Live Listing',
        status: 'ACTIVE',
        owner: { id: 'user-abc', firstName: 'Owner', lastName: 'One', email: 'owner@example.com' },
      };

      mockPrismaService.$transaction.mockResolvedValue([[mockActiveProperty], 1]);
      mockPrismaService.property.findMany.mockResolvedValue([mockActiveProperty]);
      mockPrismaService.property.count.mockResolvedValue(1);

      const result = await service.searchProperties({ location: 'Miami' });

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockPrismaService.property.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'ACTIVE' }) }),
      );
      expect(mockPrismaService.property.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'ACTIVE' }) }),
      );
      expect(result.items).toEqual([mockActiveProperty]);
      expect(result.total).toBe(1);
    });
  });

  describe('approveProperty', () => {
    it('should approve a pending property through the transition workflow', async () => {
      const transitionSpy = jest.spyOn(service, 'transitionStatus').mockResolvedValue(mockProperty as any);

      const result = await service.approveProperty('prop-123', 'admin-1');

      expect(transitionSpy).toHaveBeenCalledWith('prop-123', PropertyStatus.ACTIVE, 'admin-1', UserRole.ADMIN);
      expect(result).toBe(mockProperty);
    });
  });

  describe('rejectProperty', () => {
    it('should reject a pending property through the transition workflow', async () => {
      const transitionSpy = jest.spyOn(service, 'transitionStatus').mockResolvedValue(mockProperty as any);

      const result = await service.rejectProperty('prop-123', 'admin-1');

      expect(transitionSpy).toHaveBeenCalledWith('prop-123', PropertyStatus.ARCHIVED, 'admin-1', UserRole.ADMIN);
      expect(result).toBe(mockProperty);
    });
  });

  describe('update', () => {
    it('should update HOA information', async () => {
      const result = await service.update('prop-123', {
        hoaName: 'Updated HOA',
        hoaMonthlyFee: 400,
        hoaAmenities: ['Clubhouse', 'Security'],
        hoaContactInfo: '555-0100',
      });

      expect(result).toBeDefined();
      expect(prisma.property.update).toHaveBeenCalledWith({
        where: { id: 'prop-123' },
        data: expect.objectContaining({
          hoaName: 'Updated HOA',
          hoaMonthlyFee: new Decimal('400'),
          hoaAmenities: ['Clubhouse', 'Security'],
          hoaContactInfo: '555-0100',
        }),
      });
    });

    it('should re-geocode when country is changed', async () => {
      const existingProperty = {
        id: 'prop-123',
        address: '123 Beach Ave',
        city: 'Miami',
        state: 'FL',
        zipCode: '33101',
        country: 'USA',
      } as any;

      mockPrismaService.property.findUnique.mockResolvedValueOnce(existingProperty);
      mockGeocodingService.hasAddressChanged.mockReturnValueOnce(true);
      mockGeocodingService.geocodeAddress.mockResolvedValueOnce({
        latitude: 25.123,
        longitude: -80.123,
      });

      await service.update('prop-123', { country: 'US' });

      expect(mockGeocodingService.geocodeAddress).toHaveBeenCalledWith({
        address: '123 Beach Ave',
        city: 'Miami',
        state: 'FL',
        zipCode: '33101',
        country: 'US',
      });
      expect(prisma.property.update).toHaveBeenCalledWith({
        where: { id: 'prop-123' },
        data: expect.objectContaining({
          latitude: 25.123,
          longitude: -80.123,
        }),
      });
    });
  });

  describe('bulkUpdatePropertyStatus', () => {
    it('should call updateMany with property ids and status', async () => {
      mockPrismaService.property.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.bulkUpdatePropertyStatus(
        ['id-1', 'id-2', 'id-3'],
        PropertyStatus.ACTIVE,
      );

      expect(prisma.property.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['id-1', 'id-2', 'id-3'] } },
        data: { status: 'ACTIVE' },
      });
      expect(result).toEqual({ updatedCount: 3 });
    });

    it('should map DRAFT status correctly', async () => {
      mockPrismaService.property.updateMany.mockResolvedValue({ count: 1 });

      await service.bulkUpdatePropertyStatus(['id-1'], PropertyStatus.DRAFT);

      expect(prisma.property.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'DRAFT' } }),
      );
    });
  });

  describe('bulkDeleteProperties', () => {
    it('should call deleteMany and return deleted count and ids', async () => {
      mockPrismaService.property.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.bulkDeleteProperties(['id-1', 'id-2']);

      expect(prisma.property.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['id-1', 'id-2'] } },
      });
      expect(result).toEqual({
        deletedCount: 2,
        propertyIds: ['id-1', 'id-2'],
      });
    });
  });

  describe('bulkExportProperties', () => {
    it('should call findMany with property ids and return export data', async () => {
      const mockProperties = [
        {
          id: 'prop-1',
          title: 'Test Property',
          address: '123 Main St',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          price: BigInt(500000),
          propertyType: 'HOUSE',
          bedrooms: 3,
          bathrooms: 2,
          squareFeet: BigInt(1500),
          lotSize: null,
          yearBuilt: 2020,
          status: 'ACTIVE',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-02'),
          ownerId: 'owner-1',
          owner: {
            id: 'owner-1',
            email: 'owner@test.com',
            firstName: 'John',
            lastName: 'Doe',
            phone: '555-0100',
          },
        },
      ];

      mockPrismaService.property.findMany.mockResolvedValue(mockProperties);

      const result = await service.bulkExportProperties(['prop-1']);

      expect(prisma.property.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['prop-1'] } },
        select: expect.any(Object),
      });
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('data');
      expect(result.total).toBe(1);
      expect(result.data[0]).toHaveProperty('ownerEmail', 'owner@test.com');
    });

    it('should apply title filter when provided', async () => {
      mockPrismaService.property.findMany.mockResolvedValue([]);

      await service.bulkExportProperties(['prop-1'], 'test');

      expect(prisma.property.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: ['prop-1'] },
            title: { contains: 'test', mode: 'insensitive' },
          },
        }),
      );
    });
  });
});
