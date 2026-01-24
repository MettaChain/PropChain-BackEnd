import { PaginationService } from './pagination.service';
import { PaginationDto } from './pagination.dto';

describe('PaginationService', () => {
  let service: PaginationService;

  beforeEach(() => {
    service = new PaginationService();
  });

  it('should return correct metadata for the first page', () => {
    const dto: PaginationDto = { page: 1, limit: 10 };
    const data = ['item1', 'item2'];
    const total = 20;

    const result = service.paginate(data, total, dto);

    expect(result.data).toEqual(data);
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
});