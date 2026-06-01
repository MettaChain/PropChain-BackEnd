import { Test, TestingModule } from '@nestjs/testing';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto } from './dto/property.dto';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { UserRole } from '../types/prisma.types';
import { AuthService } from '../auth/auth.service';

describe('PropertiesController', () => {
  let controller: PropertiesController;
  let service: PropertiesService;

  const mockProperty = {
    id: 'prop-123',
    title: 'Beautiful Beach Condo',
    address: '123 Beach Ave',
    city: 'Miami',
    state: 'FL',
    zipCode: '33101',
    price: 450000,
    propertyType: 'Condo',
    status: 'DRAFT',
    ownerId: 'user-123',
    hoaName: 'Beachside HOA',
    hoaMonthlyFee: 325.5,
    hoaAmenities: ['Pool', 'Gym'],
    hoaContactInfo: 'hoa@example.com',
  };

  const mockPropertiesService = {
    create: jest.fn().mockResolvedValue(mockProperty),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PropertiesController],
      providers: [
        {
          provide: PropertiesService,
          useValue: mockPropertiesService,
        },
        {
          provide: AuthService,
          useValue: {
            validateAccessToken: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<PropertiesController>(PropertiesController);
    service = module.get<PropertiesService>(PropertiesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a property listing and associate it with the authenticated user', async () => {
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

      const userPayload: AuthUserPayload = {
        sub: 'user-123',
        email: 'owner@example.com',
        role: UserRole.USER,
        type: 'access',
      };

      const result = await controller.create(createDto, userPayload);

      expect(result).toBeDefined();
      expect(result.id).toBe('prop-123');
      expect(result.status).toBe('DRAFT');
      expect(result.ownerId).toBe('user-123');
      expect(result.hoaName).toBe('Beachside HOA');
      expect(result.hoaMonthlyFee).toBe(325.5);
      expect(result.hoaAmenities).toEqual(['Pool', 'Gym']);
      expect(result.hoaContactInfo).toBe('hoa@example.com');
      expect(service.create).toHaveBeenCalledWith(createDto, 'user-123');
    });
  });
});
