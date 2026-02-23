import { Test, TestingModule } from '@nestjs/testing';
import { PropertiesService } from '../../src/properties/properties.service';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CreatePropertyDto, PropertyStatus, PropertyType } from '../../src/properties/dto/create-property.dto';
import { UpdatePropertyDto } from '../../src/properties/dto/update-property.dto';
import { PropertyQueryDto } from '../../src/properties/dto/property-query.dto';
import { PrismaProperty } from '../../src/types/prisma.types';

// Mock Prisma PropertyStatus enum
const PrismaPropertyStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  LISTED: 'LISTED',
  SOLD: 'SOLD',
  REMOVED: 'REMOVED',
} as const;
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';

describe('PropertiesService', () => {
  let service: PropertiesService;
  let prismaService: PrismaService;
  let configService: ConfigService;

  const mockUser = {
    id: 'user_123',
    email: 'test@example.com',
    role: 'USER',
  };

  const mockProperty: PrismaProperty = {
    id: 'prop_123',
    title: 'Test Property',
    description: 'Test Description',
    location: '123 Test St, Test City, Test State, 12345, Test Country',
    price: new Decimal(500000),
    status: PrismaPropertyStatus.LISTED,
    ownerId: 'user_123',
    createdAt: new Date(),
    updatedAt: new Date(),
    bedrooms: 3,
    bathrooms: 2,
    squareFootage: new Decimal(1500),
    propertyType: PropertyType.RESIDENTIAL,
    estimatedValue: null,
    valuationDate: null,
    valuationConfidence: null,
    valuationSource: null,
    lastValuationId: null,
    yearBuilt: null,
    lotSize: null,
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    property: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropertiesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<PropertiesService>(PropertiesService);
    prismaService = module.get<PrismaService>(PrismaService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createPropertyDto: CreatePropertyDto = {
      title: 'Test Property',
      description: 'Test Description',
      price: 500000,
      address: {
        street: '123 Test St',
        city: 'Test City',
        state: 'Test State',
        postalCode: '12345',
        country: 'Test Country',
      },
      type: PropertyType.RESIDENTIAL,
      status: PropertyStatus.AVAILABLE,
      bedrooms: 3,
      bathrooms: 2,
      areaSqFt: 1500,
    };

    it('should create a property successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.property.create.mockResolvedValue(mockProperty);

      const result = await service.create(createPropertyDto, 'user_123');

      expect(result).toEqual(mockProperty);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user_123' },
      });
      expect(mockPrismaService.property.create).toHaveBeenCalledWith({
        data: {
          title: createPropertyDto.title,
          description: createPropertyDto.description,
          location: '123 Test St, Test City, Test State, 12345, Test Country',
          price: createPropertyDto.price,
          status: PrismaPropertyStatus.LISTED,
          ownerId: 'user_123',
          bedrooms: createPropertyDto.bedrooms,
          bathrooms: createPropertyDto.bathrooms,
          squareFootage: createPropertyDto.areaSqFt,
          propertyType: createPropertyDto.type,
        },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              role: true,
            },
          },
        },
      });
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.create(createPropertyDto, 'invalid_user')).rejects.toThrow(NotFoundException);
    });

    it('should handle database errors', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.property.create.mockRejectedValue(new Error('Database error'));

      await expect(service.create(createPropertyDto, 'user_123')).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    const query: PropertyQueryDto = {
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      search: 'test',
      type: PropertyType.RESIDENTIAL,
      status: PropertyStatus.AVAILABLE,
      minPrice: 100000,
      maxPrice: 1000000,
    };

    it('should return paginated properties with filters', async () => {
      const mockProperties = [mockProperty];
      const mockTotal = 1;

      mockPrismaService.property.findMany.mockResolvedValue(mockProperties);
      mockPrismaService.property.count.mockResolvedValue(mockTotal);

      const result = await service.findAll(query);

      expect(result).toEqual({
        properties: mockProperties,
        total: mockTotal,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('should apply search filter correctly', async () => {
      await service.findAll({ search: 'test' });

      expect(mockPrismaService.property.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { title: { contains: 'test', mode: 'insensitive' } },
              { description: { contains: 'test', mode: 'insensitive' } },
              { location: { contains: 'test', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('should apply price range filter correctly', async () => {
      await service.findAll({ minPrice: 100000, maxPrice: 500000 });

      expect(mockPrismaService.property.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            price: {
              gte: 100000,
              lte: 500000,
            },
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a property by ID', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);

      const result = await service.findOne('prop_123');

      expect(result).toEqual(mockProperty);
      expect(mockPrismaService.property.findUnique).toHaveBeenCalledWith({
        where: { id: 'prop_123' },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              role: true,
            },
          },
          documents: {
            select: {
              id: true,
              name: true,
              type: true,
              status: true,
              createdAt: true,
            },
          },
          valuations: {
            orderBy: { valuationDate: 'desc' },
            take: 5,
          },
        },
      });
    });

    it('should throw NotFoundException if property does not exist', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue(null);

      await expect(service.findOne('invalid_id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const updatePropertyDto: UpdatePropertyDto = {
      title: 'Updated Property',
      price: 600000,
    };

    it('should update a property successfully', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);
      mockPrismaService.property.update.mockResolvedValue({
        ...mockProperty,
        title: 'Updated Property',
        price: 600000,
      });

      const result = await service.update('prop_123', updatePropertyDto);

      expect(result.title).toBe('Updated Property');
      expect(result.price).toBe(600000);
      expect(mockPrismaService.property.update).toHaveBeenCalledWith({
        where: { id: 'prop_123' },
        data: {
          title: 'Updated Property',
          price: 600000,
        },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              role: true,
            },
          },
        },
      });
    });

    it('should throw NotFoundException if property does not exist', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue(null);

      await expect(service.update('invalid_id', updatePropertyDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a property successfully', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);
      mockPrismaService.property.delete.mockResolvedValue(mockProperty);

      await expect(service.remove('prop_123')).resolves.not.toThrow();
      expect(mockPrismaService.property.delete).toHaveBeenCalledWith({
        where: { id: 'prop_123' },
      });
    });

    it('should throw NotFoundException if property does not exist', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue(null);

      await expect(service.remove('invalid_id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('searchNearby', () => {
    it('should search properties near a location', async () => {
      mockPrismaService.property.findMany.mockResolvedValue([mockProperty]);

      const result = await service.searchNearby(40.7128, -74.006, 10);

      expect(result).toEqual({
        properties: [mockProperty],
        total: 1,
      });
    });
  });

  describe('updateStatus', () => {
    it('should update property status with valid transition', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue(mockProperty);
      mockPrismaService.property.update.mockResolvedValue({
        ...mockProperty,
        status: PrismaPropertyStatus.SOLD,
      });

      const result = await service.updateStatus('prop_123', PropertyStatus.SOLD, 'user_123');

      expect(result.status).toBe(PrismaPropertyStatus.SOLD);
    });

    it('should throw BadRequestException for invalid status transition', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue({
        ...mockProperty,
        status: PrismaPropertyStatus.SOLD,
      });

      await expect(service.updateStatus('prop_123', PropertyStatus.AVAILABLE, 'user_123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findByOwner', () => {
    it('should return properties by owner', async () => {
      mockPrismaService.property.findMany.mockResolvedValue([mockProperty]);
      mockPrismaService.property.count.mockResolvedValue(1);

      const result = await service.findByOwner('user_123');

      expect(result).toEqual({
        properties: [mockProperty],
        total: 1,
      });
    });
  });

  describe('getStatistics', () => {
    it('should return property statistics', async () => {
      mockPrismaService.property.count.mockResolvedValue(10);
      mockPrismaService.property.groupBy
        .mockResolvedValueOnce([{ status: PrismaPropertyStatus.LISTED, _count: 5 }])
        .mockResolvedValueOnce([{ propertyType: PropertyType.RESIDENTIAL, _count: 8 }]);
      mockPrismaService.property.aggregate.mockResolvedValue({
        _avg: { price: 500000 },
      });

      const result = await service.getStatistics();

      expect(result).toEqual({
        total: 10,
        byStatus: { [PrismaPropertyStatus.LISTED]: 5 },
        byType: { [PropertyType.RESIDENTIAL]: 8 },
        averagePrice: 500000,
      });
    });
  });

  describe('helper methods', () => {
    it('should format address correctly', () => {
      const address = {
        street: '123 Test St',
        city: 'Test City',
        state: 'Test State',
        postalCode: '12345',
        country: 'Test Country',
      };

      const result = (service as any).formatAddress(address);
      expect(result).toBe('123 Test St, Test City, Test State, 12345, Test Country');
    });

    it('should map property status correctly', () => {
      const serviceInstance = service as any;

      expect(serviceInstance.mapPropertyStatus(PropertyStatus.AVAILABLE)).toBe(PrismaPropertyStatus.LISTED);
      expect(serviceInstance.mapPropertyStatus(PropertyStatus.SOLD)).toBe(PrismaPropertyStatus.SOLD);
      expect(serviceInstance.mapPropertyStatus(PropertyStatus.PENDING)).toBe(PrismaPropertyStatus.PENDING);
    });

    it('should validate status transitions correctly', () => {
      const serviceInstance = service as any;

      expect(serviceInstance.isValidStatusTransition(PrismaPropertyStatus.LISTED, PrismaPropertyStatus.SOLD)).toBe(
        true,
      );

      expect(serviceInstance.isValidStatusTransition(PrismaPropertyStatus.SOLD, PrismaPropertyStatus.LISTED)).toBe(
        false,
      );
    });
  });
});
