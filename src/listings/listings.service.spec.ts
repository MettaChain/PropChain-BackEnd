import { ListingsService } from './listings.service';
import { PrismaService } from '../database/prisma.service';

describe('ListingsService', () => {
  let service: ListingsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      property: {
        findMany: jest.fn().mockResolvedValue([{ id: 'p1' }]),
        count: jest.fn().mockResolvedValue(25),
      },
    };
    service = new ListingsService(prisma as unknown as PrismaService);
  });

  it('returns paginated listings with meta', async () => {
    const result = await service.findAll(2, 10);
    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(result.meta).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
  });

  it('caps limit at 100', async () => {
    const result = await service.findAll(1, 500);
    expect(result.meta.limit).toBe(100);
  });

  it('health returns ok when database is reachable', async () => {
    const result = await service.checkHealth();
    expect(result.status).toBe('ok');
  });

  it('health returns error when database fails', async () => {
    prisma.property.count.mockRejectedValueOnce(new Error('db down'));
    const result = await service.checkHealth();
    expect(result.status).toBe('error');
  });
});
