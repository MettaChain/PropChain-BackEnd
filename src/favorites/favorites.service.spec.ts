import { FavoritesService } from './favorites.service';
import { PrismaService } from '../database/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('FavoritesService', () => {
  let service: FavoritesService;
  let prisma: jest.Mocked<Partial<PrismaService>>;

  beforeEach(() => {
    prisma = {
      property: { findUnique: jest.fn().mockResolvedValue(null) } as any,
      propertyFavorite: {
        create: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      } as any,
    };
    service = new FavoritesService(prisma as unknown as PrismaService);
  });

  it('addFavorite throws NotFoundException when property does not exist', async () => {
    await expect(service.addFavorite('user-1', 'prop-1')).rejects.toThrow(NotFoundException);
  });

  it('removeFavorite throws NotFoundException when favorite does not exist', async () => {
    await expect(service.removeFavorite('user-1', 'prop-1')).rejects.toThrow(NotFoundException);
  });
});