import { PropertyComparisonService } from './property-comparison.service';
import { PrismaService } from '../database/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('PropertyComparisonService', () => {
  let service: PropertyComparisonService;
  let prisma: jest.Mocked<Partial<PrismaService>>;

  beforeEach(() => {
    prisma = {
      property: {
        findMany: jest.fn().mockResolvedValue([]),
      } as any,
      comparisonShare: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      } as any,
    };
    service = new PropertyComparisonService(prisma as unknown as PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('compare throws NotFoundException when properties not found', async () => {
    await expect(service.compare(['missing-id'])).rejects.toThrow(NotFoundException);
  });

  it('getSharedComparison throws NotFoundException when token not found', async () => {
    await expect(service.getSharedComparison('bad-token')).rejects.toThrow(NotFoundException);
  });
});
