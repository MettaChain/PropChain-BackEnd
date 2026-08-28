import { CleanupService } from './cleanup.service';
import { PrismaService } from './prisma.service';

describe('CleanupService', () => {
  let service: CleanupService;
  let prisma: jest.Mocked<Partial<PrismaService>>;

  beforeEach(() => {
    prisma = {
      blacklistedToken: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      } as any,
      passwordResetToken: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      } as any,
      session: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      } as any,
      loginHistory: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      } as any,
    };
    service = new CleanupService(prisma as unknown as PrismaService);
  });

  it('performCleanup returns summary with totalDeleted of 0 when no records exist', async () => {
    const summary = await service.performCleanup();
    expect(summary.totalDeleted).toBe(0);
    expect(summary.results).toHaveLength(4);
  });

  it('getLastSummary returns null before any cleanup run', () => {
    const result = service.getLastSummary();
    expect(result).toBeNull();
  });
});