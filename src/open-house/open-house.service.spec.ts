import { OpenHouseService } from './open-house.service';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotFoundException } from '@nestjs/common';

describe('OpenHouseService', () => {
  let service: OpenHouseService;
  let prisma: jest.Mocked<Partial<PrismaService>>;

  beforeEach(() => {
    prisma = {
      openHouse: {
        create: jest.fn().mockResolvedValue({ id: 'oh-1' }),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      } as any,
    };
    service = new OpenHouseService(
      prisma as unknown as PrismaService,
      { sendNotification: jest.fn() } as unknown as NotificationsService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findOne throws NotFoundException when open house not found', async () => {
    await expect(service.findOne('missing-id')).rejects.toThrow(NotFoundException);
  });
});
