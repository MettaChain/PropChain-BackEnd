import { BackwardCompatibilityService } from './backward-compatibility.service';
import { ApiVersionEnum } from './api-version.constants';

describe('BackwardCompatibilityService', () => {
  let service: BackwardCompatibilityService;

  beforeEach(() => {
    service = new BackwardCompatibilityService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('transform', () => {
    it('should return the same data if fromVersion equals toVersion', () => {
      const data = { id: 1, name: 'Test', email: 'test@example.com' };
      
      const result = service.transform(data, ApiVersionEnum.V2, ApiVersionEnum.V2, 'user');
      
      expect(result).toBe(data);
    });

    describe('V2 to V1 transformation', () => {
      it('should transform user data from V2 to V1 format', () => {
        const v2UserData = {
          id: 1,
          name: 'John Doe',
          email: 'john@example.com',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          trustScore: 85
        };

        const result = service.transform(v2UserData, ApiVersionEnum.V2, ApiVersionEnum.V1, 'user');

        expect(result).toEqual({
          id: 1,
          name: 'John Doe',
          email: 'john@example.com'
        });
        expect(result).not.toHaveProperty('createdAt');
        expect(result).not.toHaveProperty('updatedAt');
        expect(result).not.toHaveProperty('trustScore');
      });

      it('should transform property data from V2 to V1 format', () => {
        const v2PropertyData = {
          id: 1,
          address: '123 Main St',
          price: 500000,
          createdAt: '2026-01-01T00:00:00.000Z',
          verified: true
        };

        const result = service.transform(v2PropertyData, ApiVersionEnum.V2, ApiVersionEnum.V1, 'property');

        expect(result).toEqual({
          id: 1,
          address: '123 Main St',
          price: 500000
        });
        expect(result).not.toHaveProperty('createdAt');
        expect(result).not.toHaveProperty('verified');
      });

      it('should transform arrays of V2 data to V1', () => {
        const v2Users = [
          { id: 1, name: 'John', email: 'john@example.com', createdAt: '2026-01-01' },
          { id: 2, name: 'Jane', email: 'jane@example.com', createdAt: '2026-01-02' }
        ];

        const result = service.transform(v2Users, ApiVersionEnum.V2, ApiVersionEnum.V1, 'user');

        expect(result).toEqual([
          { id: 1, name: 'John', email: 'john@example.com' },
          { id: 2, name: 'Jane', email: 'jane@example.com' }
        ]);
      });
    });

    describe('V1 to V2 transformation', () => {
      it('should add V2 specific fields to user data when transforming from V1 to V2', () => {
        const v1UserData = {
          id: 1,
          name: 'John Doe',
          email: 'john@example.com'
        };

        const result = service.transform(v1UserData, ApiVersionEnum.V1, ApiVersionEnum.V2, 'user');

        expect(result).toHaveProperty('id', 1);
        expect(result).toHaveProperty('name', 'John Doe');
        expect(result).toHaveProperty('email', 'john@example.com');
        expect(result).toHaveProperty('createdAt');
        expect(result).toHaveProperty('updatedAt');
      });
    });

    it('should return original data if no transformer exists for the entity type', () => {
      const data = { id: 1, someField: 'value', anotherField: 'other' };
      
      const result = service.transform(data, ApiVersionEnum.V2, ApiVersionEnum.V1, 'unknown-entity');
      
      expect(result).toEqual(data);
    });
  });

  describe('register custom transformers', () => {
    it('should register and use a custom V2 to V1 transformer', () => {
      const customTransformer = jest.fn((data) => ({ customField: data.originalField }));
      service.registerV2ToV1Transformer('custom-entity', customTransformer);

      const data = { originalField: 'test' };
      const result = service.transform(data, ApiVersionEnum.V2, ApiVersionEnum.V1, 'custom-entity');

      expect(customTransformer).toHaveBeenCalledWith(data);
      expect(result).toEqual({ customField: 'test' });
    });

    it('should register and use a custom V1 to V2 transformer', () => {
      const customTransformer = jest.fn((data) => ({ ...data, newField: 'added' }));
      service.registerV1ToV2Transformer('custom-entity', customTransformer);

      const data = { originalField: 'test' };
      const result = service.transform(data, ApiVersionEnum.V1, ApiVersionEnum.V2, 'custom-entity');

      expect(customTransformer).toHaveBeenCalledWith(data);
      expect(result).toEqual({ originalField: 'test', newField: 'added' });
    });
  });

  describe('fieldExistsInVersion', () => {
    it('should return true for fields that exist in the specified version', () => {
      expect(service.fieldExistsInVersion('id', ApiVersionEnum.V1, 'user')).toBe(true);
      expect(service.fieldExistsInVersion('name', ApiVersionEnum.V2, 'user')).toBe(true);
      expect(service.fieldExistsInVersion('createdAt', ApiVersionEnum.V2, 'user')).toBe(true);
      expect(service.fieldExistsInVersion('verified', ApiVersionEnum.V2, 'property')).toBe(true);
    });

    it('should return false for fields that do not exist in the specified version', () => {
      expect(service.fieldExistsInVersion('createdAt', ApiVersionEnum.V1, 'user')).toBe(false);
      expect(service.fieldExistsInVersion('trustScore', ApiVersionEnum.V1, 'user')).toBe(false);
      expect(service.fieldExistsInVersion('verified', ApiVersionEnum.V1, 'property')).toBe(false);
    });

    it('should return false for unknown entity types or fields', () => {
      expect(service.fieldExistsInVersion('anyField', ApiVersionEnum.V1, 'unknown-entity')).toBe(false);
      expect(service.fieldExistsInVersion('unknownField', ApiVersionEnum.V1, 'user')).toBe(false);
    });
  });

  describe('filterFieldsByVersion', () => {
    it('should filter an object to only include fields available in the specified version', () => {
      const userData = {
        id: 1,
        name: 'John',
        email: 'john@example.com',
        createdAt: '2026-01-01',
        trustScore: 85
      };

      const filteredForV1 = service.filterFieldsByVersion(userData, ApiVersionEnum.V1, 'user');
      
      expect(filteredForV1).toEqual({
        id: 1,
        name: 'John',
        email: 'john@example.com'
      });
      expect(filteredForV1).not.toHaveProperty('createdAt');
      expect(filteredForV1).not.toHaveProperty('trustScore');

      const filteredForV2 = service.filterFieldsByVersion(userData, ApiVersionEnum.V2, 'user');
      expect(filteredForV2).toEqual(userData);
    });
  });
});