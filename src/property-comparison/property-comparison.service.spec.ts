import { PropertyComparisonService } from './property-comparison.service';
import { PrismaService } from '../database/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('PropertyComparisonService', () => {
  let service: PropertyComparisonService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      property: {
        findMany: jest.fn().mockResolvedValue([]),
      } as any,
      comparisonShare: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
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

  describe('getSharedComparison (#1292)', () => {
    const baseShare = {
      shareToken: 'token-1',
      propertyIds: ['p1', 'p2'],
      createdById: 'user-1',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null as Date | null,
      viewCount: 2,
      lastViewedAt: null as Date | null,
    };

    it('rejects an expired share', async () => {
      prisma.comparisonShare.findUnique = jest.fn().mockResolvedValue({
        ...baseShare,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.getSharedComparison('token-1')).rejects.toThrow(/expired/i);
    });

    it('rejects a revoked share', async () => {
      prisma.comparisonShare.findUnique = jest.fn().mockResolvedValue({
        ...baseShare,
        revokedAt: new Date(),
      });

      await expect(service.getSharedComparison('token-1')).rejects.toThrow(/revoked/i);
    });

    it('serves a valid share without owner PII and records the view', async () => {
      prisma.comparisonShare.findUnique = jest.fn().mockResolvedValue(baseShare);
      prisma.comparisonShare.update = jest.fn().mockResolvedValue(baseShare);
      prisma.property.findMany = jest.fn().mockResolvedValue([
        { id: 'p1', title: 'One', features: [] },
        { id: 'p2', title: 'Two', features: [] },
      ]);

      const result = await service.getSharedComparison('token-1');

      expect(result.shareToken).toBe('token-1');
      expect(result.viewCount).toBe(3);
      expect(result.properties).toHaveLength(2);
      expect(result.properties[0]).not.toHaveProperty('owner');

      // The owner relation must not be requested for public shares.
      const findManyArgs = (prisma.property.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyArgs.include).toBeUndefined();

      expect(prisma.comparisonShare.update).toHaveBeenCalledWith({
        where: { shareToken: 'token-1' },
        data: { viewCount: { increment: 1 }, lastViewedAt: expect.any(Date) },
      });
    });

    it('still serves the share when view tracking fails', async () => {
      prisma.comparisonShare.findUnique = jest.fn().mockResolvedValue(baseShare);
      prisma.comparisonShare.update = jest.fn().mockRejectedValue(new Error('db down'));
      prisma.property.findMany = jest.fn().mockResolvedValue([
        { id: 'p1', title: 'One', features: [] },
        { id: 'p2', title: 'Two', features: [] },
      ]);

      const result = await service.getSharedComparison('token-1');
      expect(result.properties).toHaveLength(2);
    });
  });

  describe('revokeShare (#1292)', () => {
    it('throws NotFoundException for an unknown token', async () => {
      await expect(service.revokeShare('missing', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it("forbids revoking another user's share", async () => {
      prisma.comparisonShare.findUnique = jest
        .fn()
        .mockResolvedValue({ shareToken: 't', createdById: 'owner', revokedAt: null });

      await expect(service.revokeShare('t', 'intruder')).rejects.toThrow(ForbiddenException);
    });

    it('marks the share as revoked', async () => {
      prisma.comparisonShare.findUnique = jest
        .fn()
        .mockResolvedValue({ shareToken: 't', createdById: 'owner', revokedAt: null });
      prisma.comparisonShare.update = jest
        .fn()
        .mockResolvedValue({ shareToken: 't', revokedAt: new Date() });

      const result = await service.revokeShare('t', 'owner');

      expect(result.alreadyRevoked).toBe(false);
      expect(result.revokedAt).toBeInstanceOf(Date);
      expect(prisma.comparisonShare.update).toHaveBeenCalledWith({
        where: { shareToken: 't' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('is idempotent when the share is already revoked', async () => {
      const revokedAt = new Date();
      prisma.comparisonShare.findUnique = jest
        .fn()
        .mockResolvedValue({ shareToken: 't', createdById: 'owner', revokedAt });

      const result = await service.revokeShare('t', 'owner');

      expect(result.alreadyRevoked).toBe(true);
      expect(prisma.comparisonShare.update).not.toHaveBeenCalled();
    });
  });
});
