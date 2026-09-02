import { ArchiveService } from './archive.service';
import { PrismaService } from '../database/prisma.service';

describe('ArchiveService', () => {
  let service: ArchiveService;
  let prisma: jest.Mocked<Partial<PrismaService>>;

  beforeEach(() => {
    prisma = {
      loginHistory: { findMany: jest.fn().mockResolvedValue([]) } as any,
      activityLog: { findMany: jest.fn().mockResolvedValue([]) } as any,
      propertyView: { findMany: jest.fn().mockResolvedValue([]) } as any,
    };
    service = new ArchiveService(prisma as unknown as PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
