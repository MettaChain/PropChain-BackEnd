import { PaginationService } from './pagination.service';
import { PaginationDto } from './pagination.dto';

describe('PaginationService', () => {
  let service: PaginationService;

  beforeEach(() => {
    service = new PaginationService();
  });

  describe('paginate', () => {
    it('should return correct metadata for the first page', () => {
      const dto: PaginationDto = { page: 1, limit: 10 };
      const data = ['item1', 'item2'];
      const total = 20;

      const result = service.paginate(data, total, dto);

      expect(result.data).toEqual(data);
      expect(result.meta.total).toBe(total);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.totalPages).toBe(2);
      expect(result.meta.hasNext).toBe(true);
      expect(result.meta.hasPrev).toBe(false);
    });

    it('should return correct metadata for the last page', () => {
      const dto: PaginationDto = { page: 2, limit: 10 };
      const data = ['item11', 'item12'];
      const total = 20;

      const result = service.paginate(data, total, dto);

      expect(result.meta.hasNext).toBe(false);
      expect(result.meta.hasPrev).toBe(true);
    });

    it('should handle empty data correctly', () => {
      const dto: PaginationDto = { page: 1, limit: 10 };
      const data: any[] = [];
      const total = 0;

      const result = service.paginate(data, total, dto);

      expect(result.meta.totalPages).toBe(0);
      expect(result.meta.hasNext).toBe(false);
      expect(result.meta.hasPrev).toBe(false);
    });
  });

  describe('parseSort', () => {
    it('should parse valid sort strings correctly', () => {
      const sortString = 'price:desc';
      const result = service.parseSort(sortString);
      expect(result).toEqual({ price: 'desc' });
    });

    it('should handle case insensitivity for sort order', () => {
      const sortString = 'title:ASC';
      const result = service.parseSort(sortString);
      expect(result).toEqual({ title: 'asc' });
    });

    it('should return default sort if sort string is missing or malformed', () => {
      const result = service.parseSort('');
      expect(result).toEqual({ createdAt: 'desc' });
    });
  });
});