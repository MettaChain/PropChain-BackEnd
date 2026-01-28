import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaginationDto, SortDto, DateRangeDto } from '../../src/common/dto';

describe('Common DTOs', () => {
  describe('PaginationDto', () => {
    it('should pass with valid page and limit', async () => {
      const dto = plainToInstance(PaginationDto, {
        page: 1,
        limit: 20,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with default values when empty', async () => {
      const dto = plainToInstance(PaginationDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.page).toBe(1);
      expect(dto.limit).toBe(20);
    });

    it('should fail when page is less than 1', async () => {
      const dto = plainToInstance(PaginationDto, {
        page: 0,
        limit: 20,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('min');
    });

    it('should fail when limit exceeds 100', async () => {
      const dto = plainToInstance(PaginationDto, {
        page: 1,
        limit: 101,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('max');
    });

    it('should fail when page is not an integer', async () => {
      const dto = plainToInstance(PaginationDto, {
        page: 1.5,
        limit: 20,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('SortDto', () => {
    it('should pass with valid sortBy and sortOrder', async () => {
      const dto = plainToInstance(SortDto, {
        sortBy: 'createdAt',
        sortOrder: 'asc',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with default sortOrder when empty', async () => {
      const dto = plainToInstance(SortDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.sortOrder).toBe('desc');
    });

    it('should fail with invalid sortOrder', async () => {
      const dto = plainToInstance(SortDto, {
        sortBy: 'createdAt',
        sortOrder: 'invalid',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isIn');
    });
  });

  describe('DateRangeDto', () => {
    it('should pass with valid ISO 8601 dates', async () => {
      const dto = plainToInstance(DateRangeDto, {
        createdAfter: '2024-01-01T00:00:00.000Z',
        createdBefore: '2024-12-31T23:59:59.999Z',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass when both fields are empty', async () => {
      const dto = plainToInstance(DateRangeDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with invalid date format', async () => {
      const dto = plainToInstance(DateRangeDto, {
        createdAfter: 'invalid-date',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isIso8601');
    });

    it('should fail with non-ISO date format', async () => {
      const dto = plainToInstance(DateRangeDto, {
        createdAfter: '01/01/2024',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
