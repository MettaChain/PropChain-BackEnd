import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreatePropertyDto,
  AddressDto,
  PropertyType,
  PropertyStatus,
  PropertyQueryDto,
} from '../../src/properties/dto';

describe('Property DTOs', () => {
  describe('AddressDto', () => {
    it('should pass with valid address', async () => {
      const dto = plainToInstance(AddressDto, {
        street: '123 Main Street',
        city: 'New York',
        country: 'United States',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with optional fields', async () => {
      const dto = plainToInstance(AddressDto, {
        street: '123 Main Street',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'United States',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with empty street', async () => {
      const dto = plainToInstance(AddressDto, {
        street: '',
        city: 'New York',
        country: 'United States',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with street too long', async () => {
      const dto = plainToInstance(AddressDto, {
        street: 'A'.repeat(256),
        city: 'New York',
        country: 'United States',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with missing required fields', async () => {
      const dto = plainToInstance(AddressDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(3); // street, city, country
    });
  });

  describe('CreatePropertyDto', () => {
    const validPropertyData = {
      title: 'Luxury Downtown Apartment',
      price: 500000,
      address: {
        street: '123 Main Street',
        city: 'New York',
        country: 'United States',
      },
    };

    it('should pass with valid property data', async () => {
      const dto = plainToInstance(CreatePropertyDto, validPropertyData);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with all optional fields', async () => {
      const dto = plainToInstance(CreatePropertyDto, {
        ...validPropertyData,
        description: 'Beautiful apartment with city views',
        features: ['Swimming Pool', 'Garage'],
        type: PropertyType.RESIDENTIAL,
        status: PropertyStatus.AVAILABLE,
        bedrooms: 3,
        bathrooms: 2,
        areaSqFt: 1500,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with empty title', async () => {
      const dto = plainToInstance(CreatePropertyDto, {
        ...validPropertyData,
        title: '',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with title too long', async () => {
      const dto = plainToInstance(CreatePropertyDto, {
        ...validPropertyData,
        title: 'A'.repeat(201),
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with negative price', async () => {
      const dto = plainToInstance(CreatePropertyDto, {
        ...validPropertyData,
        price: -100,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with zero price', async () => {
      const dto = plainToInstance(CreatePropertyDto, {
        ...validPropertyData,
        price: 0,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with price too high', async () => {
      const dto = plainToInstance(CreatePropertyDto, {
        ...validPropertyData,
        price: 9999999999999,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with invalid nested address', async () => {
      const dto = plainToInstance(CreatePropertyDto, {
        ...validPropertyData,
        address: {
          street: '',
          city: 'New York',
          country: 'United States',
        },
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with too many features', async () => {
      const dto = plainToInstance(CreatePropertyDto, {
        ...validPropertyData,
        features: Array(51).fill('Feature'),
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with invalid property type', async () => {
      const dto = plainToInstance(CreatePropertyDto, {
        ...validPropertyData,
        type: 'INVALID_TYPE',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with negative bedrooms', async () => {
      const dto = plainToInstance(CreatePropertyDto, {
        ...validPropertyData,
        bedrooms: -1,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with bedrooms too high', async () => {
      const dto = plainToInstance(CreatePropertyDto, {
        ...validPropertyData,
        bedrooms: 101,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('PropertyQueryDto', () => {
    it('should pass with valid query parameters', async () => {
      const dto = plainToInstance(PropertyQueryDto, {
        search: 'apartment',
        type: PropertyType.RESIDENTIAL,
        city: 'New York',
        minPrice: 100000,
        maxPrice: 500000,
        page: 1,
        limit: 20,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with empty query', async () => {
      const dto = plainToInstance(PropertyQueryDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with negative minPrice', async () => {
      const dto = plainToInstance(PropertyQueryDto, {
        minPrice: -100,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with invalid property type', async () => {
      const dto = plainToInstance(PropertyQueryDto, {
        type: 'INVALID',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with invalid status', async () => {
      const dto = plainToInstance(PropertyQueryDto, {
        status: 'INVALID',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
