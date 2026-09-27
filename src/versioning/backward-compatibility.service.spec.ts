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
          role: 'USER',
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          trustScore: 85,
          emailVerified: true,
          lastLoginAt: '2026-01-03T00:00:00.000Z',
        };

        const result = service.transform(v2UserData, ApiVersionEnum.V2, ApiVersionEnum.V1, 'user');

        expect(result).toEqual({
          id: 1,
          name: 'John Doe',
          email: 'john@example.com',
          role: 'USER',
          isActive: true,
        });
        expect(result).not.toHaveProperty('createdAt');
        expect(result).not.toHaveProperty('updatedAt');
        expect(result).not.toHaveProperty('trustScore');
        expect(result).not.toHaveProperty('emailVerified');
        expect(result).not.toHaveProperty('lastLoginAt');
      });

      it('should transform property data from V2 to V1 format', () => {
        const v2PropertyData = {
          id: 1,
          address: '123 Main St',
          price: 500000,
          title: 'Beautiful Home',
          description: 'A lovely property',
          propertyType: 'RESIDENTIAL',
          bedrooms: 3,
          bathrooms: 2,
          status: 'ACTIVE',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          verified: true,
          trustScore: 90,
          squareFootage: 2000,
          yearBuilt: 2010,
          amenities: ['pool', 'garage'],
        };

        const result = service.transform(
          v2PropertyData,
          ApiVersionEnum.V2,
          ApiVersionEnum.V1,
          'property',
        );

        expect(result).toEqual({
          id: 1,
          address: '123 Main St',
          price: 500000,
          title: 'Beautiful Home',
          description: 'A lovely property',
          propertyType: 'RESIDENTIAL',
          bedrooms: 3,
          bathrooms: 2,
          status: 'ACTIVE',
        });
        expect(result).not.toHaveProperty('createdAt');
        expect(result).not.toHaveProperty('updatedAt');
        expect(result).not.toHaveProperty('verified');
        expect(result).not.toHaveProperty('trustScore');
        expect(result).not.toHaveProperty('squareFootage');
        expect(result).not.toHaveProperty('yearBuilt');
        expect(result).not.toHaveProperty('amenities');
      });

      it('should transform transaction data from V2 to V1 format', () => {
        const v2TransactionData = {
          id: 'tx-123',
          propertyId: 'prop-456',
          buyerId: 'user-789',
          sellerId: 'user-101',
          status: 'PENDING',
          type: 'SALE',
          price: 500000,
          createdAt: '2026-01-01T00:00:00.000Z',
          blockchainHash: '0xabc123',
          transactionHash: '0xdef456',
          contractAddress: '0x789xyz',
          escrowStatus: 'FUNDED',
          auditLog: [],
          updatedAt: '2026-01-02T00:00:00.000Z',
        };

        const result = service.transform(
          v2TransactionData,
          ApiVersionEnum.V2,
          ApiVersionEnum.V1,
          'transaction',
        );

        expect(result).toEqual({
          id: 'tx-123',
          propertyId: 'prop-456',
          buyerId: 'user-789',
          sellerId: 'user-101',
          status: 'PENDING',
          type: 'SALE',
          price: 500000,
          createdAt: '2026-01-01T00:00:00.000Z',
        });
        expect(result).not.toHaveProperty('blockchainHash');
        expect(result).not.toHaveProperty('transactionHash');
        expect(result).not.toHaveProperty('contractAddress');
        expect(result).not.toHaveProperty('escrowStatus');
        expect(result).not.toHaveProperty('auditLog');
        expect(result).not.toHaveProperty('updatedAt');
      });

      it('should transform auth response from V2 to V1 format', () => {
        const v2AuthData = {
          accessToken: 'token-abc',
          refreshToken: 'refresh-xyz',
          expiresIn: 3600,
          tokenType: 'Bearer',
          scope: 'read write',
          user: {
            id: 1,
            name: 'John Doe',
            email: 'john@example.com',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        };

        const result = service.transform(v2AuthData, ApiVersionEnum.V2, ApiVersionEnum.V1, 'auth');

        expect(result).toEqual({
          accessToken: 'token-abc',
          refreshToken: 'refresh-xyz',
          user: {
            id: 1,
            name: 'John Doe',
            email: 'john@example.com',
          },
        });
        expect(result).not.toHaveProperty('expiresIn');
        expect(result).not.toHaveProperty('tokenType');
        expect(result).not.toHaveProperty('scope');
        expect(result.user).not.toHaveProperty('createdAt');
      });

      it('should transform arrays of V2 data to V1', () => {
        const v2Users = [
          { 
            id: 1, 
            name: 'John', 
            email: 'john@example.com',
            role: 'USER',
            isActive: true,
            createdAt: '2026-01-01',
            trustScore: 85,
          },
          { 
            id: 2, 
            name: 'Jane', 
            email: 'jane@example.com',
            role: 'AGENT',
            isActive: true,
            createdAt: '2026-01-02',
            trustScore: 92,
          },
        ];

        const result = service.transform(v2Users, ApiVersionEnum.V2, ApiVersionEnum.V1, 'user');

        expect(result).toEqual([
          { id: 1, name: 'John', email: 'john@example.com', role: 'USER', isActive: true },
          { id: 2, name: 'Jane', email: 'jane@example.com', role: 'AGENT', isActive: true },
        ]);
      });
    });

    describe('V1 to V2 transformation', () => {
      it('should add V2 specific fields to user data when transforming from V1 to V2', () => {
        const v1UserData = {
          id: 1,
          name: 'John Doe',
          email: 'john@example.com',
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

      const result = service.transform(
        data,
        ApiVersionEnum.V2,
        ApiVersionEnum.V1,
        'unknown-entity',
      );

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
      // User fields
      expect(service.fieldExistsInVersion('id', ApiVersionEnum.V1, 'user')).toBe(true);
      expect(service.fieldExistsInVersion('name', ApiVersionEnum.V2, 'user')).toBe(true);
      expect(service.fieldExistsInVersion('email', ApiVersionEnum.V1, 'user')).toBe(true);
      expect(service.fieldExistsInVersion('role', ApiVersionEnum.V1, 'user')).toBe(true);
      expect(service.fieldExistsInVersion('isActive', ApiVersionEnum.V1, 'user')).toBe(true);
      
      // V2-only user fields
      expect(service.fieldExistsInVersion('createdAt', ApiVersionEnum.V2, 'user')).toBe(true);
      expect(service.fieldExistsInVersion('updatedAt', ApiVersionEnum.V2, 'user')).toBe(true);
      expect(service.fieldExistsInVersion('trustScore', ApiVersionEnum.V2, 'user')).toBe(true);
      expect(service.fieldExistsInVersion('emailVerified', ApiVersionEnum.V2, 'user')).toBe(true);
      expect(service.fieldExistsInVersion('lastLoginAt', ApiVersionEnum.V2, 'user')).toBe(true);
      
      // Property fields
      expect(service.fieldExistsInVersion('id', ApiVersionEnum.V1, 'property')).toBe(true);
      expect(service.fieldExistsInVersion('address', ApiVersionEnum.V2, 'property')).toBe(true);
      expect(service.fieldExistsInVersion('price', ApiVersionEnum.V1, 'property')).toBe(true);
      expect(service.fieldExistsInVersion('status', ApiVersionEnum.V1, 'property')).toBe(true);
      
      // V2-only property fields
      expect(service.fieldExistsInVersion('createdAt', ApiVersionEnum.V2, 'property')).toBe(true);
      expect(service.fieldExistsInVersion('verified', ApiVersionEnum.V2, 'property')).toBe(true);
      expect(service.fieldExistsInVersion('trustScore', ApiVersionEnum.V2, 'property')).toBe(true);
      expect(service.fieldExistsInVersion('squareFootage', ApiVersionEnum.V2, 'property')).toBe(true);
      
      // Transaction fields
      expect(service.fieldExistsInVersion('id', ApiVersionEnum.V1, 'transaction')).toBe(true);
      expect(service.fieldExistsInVersion('propertyId', ApiVersionEnum.V2, 'transaction')).toBe(true);
      expect(service.fieldExistsInVersion('status', ApiVersionEnum.V1, 'transaction')).toBe(true);
      
      // V2-only transaction fields
      expect(service.fieldExistsInVersion('blockchainHash', ApiVersionEnum.V2, 'transaction')).toBe(true);
      expect(service.fieldExistsInVersion('escrowStatus', ApiVersionEnum.V2, 'transaction')).toBe(true);
    });

    it('should return false for fields that do not exist in the specified version', () => {
      // V2-only fields should not exist in V1
      expect(service.fieldExistsInVersion('createdAt', ApiVersionEnum.V1, 'user')).toBe(false);
      expect(service.fieldExistsInVersion('trustScore', ApiVersionEnum.V1, 'user')).toBe(false);
      expect(service.fieldExistsInVersion('emailVerified', ApiVersionEnum.V1, 'user')).toBe(false);
      expect(service.fieldExistsInVersion('verified', ApiVersionEnum.V1, 'property')).toBe(false);
      expect(service.fieldExistsInVersion('squareFootage', ApiVersionEnum.V1, 'property')).toBe(false);
      expect(service.fieldExistsInVersion('blockchainHash', ApiVersionEnum.V1, 'transaction')).toBe(false);
      expect(service.fieldExistsInVersion('escrowStatus', ApiVersionEnum.V1, 'transaction')).toBe(false);
    });

    it('should return false for unknown entity types or fields', () => {
      expect(service.fieldExistsInVersion('anyField', ApiVersionEnum.V1, 'unknown-entity')).toBe(
        false,
      );
      expect(service.fieldExistsInVersion('unknownField', ApiVersionEnum.V1, 'user')).toBe(false);
    });
  });

  describe('filterFieldsByVersion', () => {
    it('should filter user object to only include V1 fields', () => {
      const userData = {
        id: 1,
        name: 'John',
        email: 'john@example.com',
        role: 'USER',
        isActive: true,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-02',
        trustScore: 85,
        emailVerified: true,
        lastLoginAt: '2026-01-03',
      };

      const filteredForV1 = service.filterFieldsByVersion(userData, ApiVersionEnum.V1, 'user');

      expect(filteredForV1).toEqual({
        id: 1,
        name: 'John',
        email: 'john@example.com',
        role: 'USER',
        isActive: true,
      });
      expect(filteredForV1).not.toHaveProperty('createdAt');
      expect(filteredForV1).not.toHaveProperty('updatedAt');
      expect(filteredForV1).not.toHaveProperty('trustScore');
      expect(filteredForV1).not.toHaveProperty('emailVerified');
      expect(filteredForV1).not.toHaveProperty('lastLoginAt');

      const filteredForV2 = service.filterFieldsByVersion(userData, ApiVersionEnum.V2, 'user');
      expect(filteredForV2).toEqual(userData);
    });

    it('should filter property object to only include V1 fields', () => {
      const propertyData = {
        id: 1,
        address: '123 Main St',
        price: 500000,
        title: 'Beautiful Home',
        description: 'Lovely property',
        propertyType: 'RESIDENTIAL',
        bedrooms: 3,
        bathrooms: 2,
        status: 'ACTIVE',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-02',
        verified: true,
        trustScore: 90,
        squareFootage: 2000,
        yearBuilt: 2010,
        amenities: ['pool', 'garage'],
      };

      const filteredForV1 = service.filterFieldsByVersion(propertyData, ApiVersionEnum.V1, 'property');

      expect(filteredForV1).toEqual({
        id: 1,
        address: '123 Main St',
        price: 500000,
        title: 'Beautiful Home',
        description: 'Lovely property',
        propertyType: 'RESIDENTIAL',
        bedrooms: 3,
        bathrooms: 2,
        status: 'ACTIVE',
      });
      expect(filteredForV1).not.toHaveProperty('createdAt');
      expect(filteredForV1).not.toHaveProperty('updatedAt');
      expect(filteredForV1).not.toHaveProperty('verified');
      expect(filteredForV1).not.toHaveProperty('trustScore');
      expect(filteredForV1).not.toHaveProperty('squareFootage');
      expect(filteredForV1).not.toHaveProperty('yearBuilt');
      expect(filteredForV1).not.toHaveProperty('amenities');

      const filteredForV2 = service.filterFieldsByVersion(propertyData, ApiVersionEnum.V2, 'property');
      expect(filteredForV2).toEqual(propertyData);
    });

    it('should filter transaction object to only include V1 fields', () => {
      const transactionData = {
        id: 'tx-123',
        propertyId: 'prop-456',
        buyerId: 'user-789',
        sellerId: 'user-101',
        status: 'PENDING',
        type: 'SALE',
        price: 500000,
        createdAt: '2026-01-01',
        blockchainHash: '0xabc123',
        transactionHash: '0xdef456',
        contractAddress: '0x789xyz',
        escrowStatus: 'FUNDED',
        auditLog: [],
        updatedAt: '2026-01-02',
      };

      const filteredForV1 = service.filterFieldsByVersion(transactionData, ApiVersionEnum.V1, 'transaction');

      expect(filteredForV1).toEqual({
        id: 'tx-123',
        propertyId: 'prop-456',
        buyerId: 'user-789',
        sellerId: 'user-101',
        status: 'PENDING',
        type: 'SALE',
        price: 500000,
        createdAt: '2026-01-01',
      });
      expect(filteredForV1).not.toHaveProperty('blockchainHash');
      expect(filteredForV1).not.toHaveProperty('transactionHash');
      expect(filteredForV1).not.toHaveProperty('contractAddress');
      expect(filteredForV1).not.toHaveProperty('escrowStatus');
      expect(filteredForV1).not.toHaveProperty('auditLog');
      expect(filteredForV1).not.toHaveProperty('updatedAt');

      const filteredForV2 = service.filterFieldsByVersion(transactionData, ApiVersionEnum.V2, 'transaction');
      expect(filteredForV2).toEqual(transactionData);
    });
  });
});
