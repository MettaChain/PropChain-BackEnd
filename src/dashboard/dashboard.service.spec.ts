import { DashboardService } from './dashboard.service';
import { PrismaService } from '../database/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: jest.Mocked<Partial<PrismaService>>;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) } as any,
      property: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } as any,
      transaction: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } as any,
    };
    service = new DashboardService(prisma as unknown as PrismaService);
  });

  it('getDashboard throws NotFoundException when user not found', async () => {
    await expect(service.getDashboard('missing-user')).rejects.toThrow(NotFoundException);
  });
});