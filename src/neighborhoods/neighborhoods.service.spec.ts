import { NeighborhoodsService } from './neighborhoods.service';
import { PrismaService } from '../database/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('NeighborhoodsService', () => {
  let service: NeighborhoodsService;
  let prisma: jest.Mocked<Partial<PrismaService>>;

  beforeEach(() => {
    prisma = {
      neighborhood: {
        create: jest.fn().mockResolvedValue({ id: 'n-1' }),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      } as any,
    };
    service = new NeighborhoodsService(prisma as unknown as PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findOne throws NotFoundException when neighborhood not found', async () => {
    await expect(service.findOne('missing-id')).rejects.toThrow(NotFoundException);
  });
});
