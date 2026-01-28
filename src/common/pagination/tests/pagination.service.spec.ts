import { Test, TestingModule } from '@nestjs/testing';
import { PaginationService } from '../pagination.service';
import { PaginationDto } from '../pagination.dto';


describe('PaginationService', () => {
  let service: PaginationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PaginationService],
    }).compile();

    service = module.get<PaginationService>(PaginationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSkip', () => {
    it('should calculate skip for first page', () => {
      expect(service.getSkip(1, 10)).toBe(0);
    });

    it('should calculate skip for second page', () => {
      expect(service.getSkip(2, 10)).toBe(10);
    });

    it('should calculate skip for any page', () => {
      expect(service.getSkip(5, 20)).toBe(80);
    });

    it('should handle page 1 with different limits', () => {
      expect(service.getSkip(1, 25)).toBe(0);
      expect(service.getSkip(1, 50)).toBe(0);
    });
  });

  describe('createMeta', () => {
    it('should create correct metadata for first page', () => {
      const meta = service.createMeta(100, 1, 10);

      expect(meta).toEqual({
        total: 100,
        page: 1,
        limit: 10,
        pages: 10,
        hasNext: true,
        hasPrev: false,
      });
    });

    it('should create correct metadata for middle page', () => {
      const meta = service.createMeta(100, 5, 10);

      expect(meta).toEqual({
        total: 100,
        page: 5,
        limit: 10,
        pages: 10,
        hasNext: true,
        hasPrev: true,
      });
    });

    it('should create correct metadata for last page', () => {
      const meta = service.createMeta(100, 10, 10);

      expect(meta).toEqual({
        total: 100,
        page: 10,
        limit: 10,
        pages: 10,
        hasNext: false,
        hasPrev: true,
      });
    });

    it('should handle empty results', () => {
      const meta = service.createMeta(0, 1, 10);

      expect(meta).toEqual({
        total: 0,
        page: 1,
        limit: 10,
        pages: 1,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('should handle non-divisible totals', () => {
      const meta = service.createMeta(95, 1, 10);

      expect(meta.pages).toBe(10);
      expect(meta.hasNext).toBe(true);
    });

    it('should handle single item', () => {
      const meta = service.createMeta(1, 1, 10);

      expect(meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        pages: 1,
        hasNext: false,
        hasPrev: false,
      });
    });
  });

  describe('createResponse', () => {
    it('should create paginated response', () => {
      const data = [{ id: 1, name: 'Test' }];
      const paginationDto: PaginationDto = { page: 1, limit: 10 };

      const response = service.createResponse(data, 100, paginationDto);

      expect(response.data).toEqual(data);
      expect(response.meta.total).toBe(100);
      expect(response.meta.page).toBe(1);
      expect(response.meta.limit).toBe(10);
    });

    it('should use default values when not provided', () => {
      const data = [{ id: 1, name: 'Test' }];
      const paginationDto: PaginationDto = {};

      const response = service.createResponse(data, 50, paginationDto);

      expect(response.meta.page).toBe(1);
      expect(response.meta.limit).toBe(10);
    });
  });

  describe('sanitizeSortField', () => {
    it('should allow valid field names', () => {
      expect(service.sanitizeSortField('name')).toBe('name');
      expect(service.sanitizeSortField('created_at')).toBe('created_at');
      expect(service.sanitizeSortField('user.email')).toBe('user.email');
    });

    it('should remove SQL injection attempts', () => {
      expect(service.sanitizeSortField('name; DROP TABLE users--')).toBe('nameDROPTABLEusers');
      expect(service.sanitizeSortField("name' OR '1'='1")).toBe('nameOR11');
    });

    it('should remove special characters', () => {
      expect(service.sanitizeSortField('name@domain')).toBe('namedomain');
      expect(service.sanitizeSortField('name!#$%')).toBe('name');
    });

    it('should handle empty string', () => {
      expect(service.sanitizeSortField('')).toBe('');
    });
  });

  describe('validatePage', () => {
    it('should validate page within range', () => {
      expect(service.validatePage(1, 100, 10)).toBe(true);
      expect(service.validatePage(5, 100, 10)).toBe(true);
      expect(service.validatePage(10, 100, 10)).toBe(true);
    });

    it('should invalidate page beyond range', () => {
      expect(service.validatePage(11, 100, 10)).toBe(false);
      expect(service.validatePage(0, 100, 10)).toBe(false);
      expect(service.validatePage(-1, 100, 10)).toBe(false);
    });

    it('should handle empty results', () => {
      expect(service.validatePage(1, 0, 10)).toBe(true);
      expect(service.validatePage(2, 0, 10)).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(service.validatePage(1, 1, 10)).toBe(true);
      expect(service.validatePage(2, 1, 10)).toBe(false);
    });
  });
});