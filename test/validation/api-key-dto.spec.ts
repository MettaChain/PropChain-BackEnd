import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateApiKeyDto, ApiKeyQueryDto } from '../../src/api-keys/dto';

describe('API Key DTOs', () => {
  describe('CreateApiKeyDto', () => {
    const validApiKeyData = {
      name: 'Production API Key',
      scopes: ['read:properties', 'write:properties'],
    };

    it('should pass with valid API key data', async () => {
      const dto = plainToInstance(CreateApiKeyDto, validApiKeyData);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with optional rate limit', async () => {
      const dto = plainToInstance(CreateApiKeyDto, {
        ...validApiKeyData,
        rateLimit: 100,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with empty name', async () => {
      const dto = plainToInstance(CreateApiKeyDto, {
        ...validApiKeyData,
        name: '',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with name too long', async () => {
      const dto = plainToInstance(CreateApiKeyDto, {
        ...validApiKeyData,
        name: 'A'.repeat(101),
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with empty scopes array', async () => {
      const dto = plainToInstance(CreateApiKeyDto, {
        ...validApiKeyData,
        scopes: [],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with missing scopes', async () => {
      const dto = plainToInstance(CreateApiKeyDto, {
        name: 'Test Key',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with rate limit less than 1', async () => {
      const dto = plainToInstance(CreateApiKeyDto, {
        ...validApiKeyData,
        rateLimit: 0,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with negative rate limit', async () => {
      const dto = plainToInstance(CreateApiKeyDto, {
        ...validApiKeyData,
        rateLimit: -10,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with non-integer rate limit', async () => {
      const dto = plainToInstance(CreateApiKeyDto, {
        ...validApiKeyData,
        rateLimit: 10.5,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should pass with single scope', async () => {
      const dto = plainToInstance(CreateApiKeyDto, {
        name: 'Read Only Key',
        scopes: ['read:properties'],
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('ApiKeyQueryDto', () => {
    it('should pass with valid query parameters', async () => {
      const dto = plainToInstance(ApiKeyQueryDto, {
        isActive: true,
        page: 1,
        limit: 20,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with empty query', async () => {
      const dto = plainToInstance(ApiKeyQueryDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with isActive as string true', async () => {
      const dto = plainToInstance(ApiKeyQueryDto, {
        isActive: true,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with isActive as false', async () => {
      const dto = plainToInstance(ApiKeyQueryDto, {
        isActive: false,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should include pagination defaults', async () => {
      const dto = plainToInstance(ApiKeyQueryDto, {});
      expect(dto.page).toBe(1);
      expect(dto.limit).toBe(20);
    });
  });
});
