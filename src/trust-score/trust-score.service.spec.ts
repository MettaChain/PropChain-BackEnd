import { Test, TestingModule } from '@nestjs/testing';
import { TrustScoreService } from './trust-score.service';
import { PrismaService } from '../database/prisma.service';

describe('TrustScoreService', () => {
  let service: TrustScoreService;
  let prismaService: PrismaService;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    phone: '+1234567890',
    isVerified: true,
    twoFactorEnabled: true,
    avatar: 'avatar.jpg',
    trustScore: 75,
    lastTrustScoreUpdate: new Date(),
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date(),
    lastActivityAt: new Date(),
    properties: [
      { id: 'prop-1', status: 'ACTIVE' },
      { id: 'prop-2', status: 'ACTIVE' },
    ],
    buyerTransactions: [
      { id: 'tx-1', status: 'COMPLETED' },
      { id: 'tx-2', status: 'COMPLETED' },
    ],
    sellerTransactions: [{ id: 'tx-3', status: 'COMPLETED' }],
    apiKeys: [
      {
        id: 'key-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86400000),
        lastUsedAt: new Date(Date.now() - 86400000),
      },
    ],
    passwordHistory: [
      {
        id: 'ph-1',
        createdAt: new Date(Date.now() - 30 * 86400000),
      },
    ],
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    verificationDocument: {
      findFirst: jest.fn(),
    },
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrustScoreService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<TrustScoreService>(TrustScoreService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateTrustScore', () => {
    it('should calculate trust score for a user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.verificationDocument.findFirst.mockResolvedValue(null);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        trustScore: 75,
        lastTrustScoreUpdate: new Date(),
      });

      const result = await service.calculateTrustScore('user-123');

      expect(result).toEqual({
        userId: 'user-123',
        score: expect.any(Number),
        breakdown: expect.objectContaining({
          emailVerified: expect.objectContaining({
            score: 10,
            maxScore: 10,
            percentage: 100,
          }),
          idVerified: expect.objectContaining({
            score: expect.any(Number),
            maxScore: 20,
            percentage: expect.any(Number),
          }),
          completedTransactions: expect.objectContaining({
            score: expect.any(Number),
            maxScore: 45,
            percentage: expect.any(Number),
          }),
          activityDecay: expect.objectContaining({
            score: expect.any(Number),
            maxScore: expect.any(Number),
            percentage: expect.any(Number),
          }),
          totalScore: expect.any(Number),
          totalMaxScore: 75,
        }),
        lastUpdated: expect.any(Date),
        nextUpdateTime: expect.any(Date),
      });

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          trustScore: expect.any(Number),
          lastTrustScoreUpdate: expect.any(Date),
        },
      });
    });

    it('should throw error if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.calculateTrustScore('nonexistent')).rejects.toThrow('User not found');
    });
  });

  describe('getTrustScore', () => {
    it('should return cached score if no refresh needed', async () => {
      const recentUpdate = new Date(Date.now() - 12 * 3600000);
      const userWithRecentUpdate = {
        ...mockUser,
        lastTrustScoreUpdate: recentUpdate,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(userWithRecentUpdate);
      mockPrismaService.verificationDocument.findFirst.mockResolvedValue(null);
      jest.spyOn(service, 'getScoreBreakdown').mockResolvedValue({
        emailVerified: { score: 10, maxScore: 10, percentage: 100 },
        idVerified: { score: 0, maxScore: 20, percentage: 0 },
        completedTransactions: { score: 45, maxScore: 45, percentage: 100 },
        activityDecay: { score: 55, maxScore: 55, percentage: 100 },
        totalScore: 55,
        totalMaxScore: 75,
      });

      const result = await service.getTrustScore('user-123', false);

      expect(result.score).toBe(75);
      expect(result.lastUpdated).toBe(recentUpdate);
    });

    it('should refresh score if forceRefresh is true', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        trustScore: 80,
        lastTrustScoreUpdate: new Date(),
      });

      jest.spyOn(service, 'calculateTrustScore').mockResolvedValue({
        userId: 'user-123',
        score: 80,
        breakdown: {} as any,
        lastUpdated: new Date(),
        nextUpdateTime: new Date(),
      });

      await service.getTrustScore('user-123', true);

      expect(service.calculateTrustScore).toHaveBeenCalledWith('user-123');
    });
  });

  describe('getScoreBreakdown', () => {
    it('should return detailed breakdown', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.verificationDocument.findFirst.mockResolvedValue(null);

      const breakdown = await service.getScoreBreakdown('user-123');

      expect(breakdown).toEqual({
        emailVerified: { score: 10, maxScore: 10, percentage: 100 },
        idVerified: { score: 0, maxScore: 20, percentage: 0 },
        completedTransactions: expect.objectContaining({
          score: expect.any(Number),
          maxScore: 45,
          percentage: expect.any(Number),
        }),
        activityDecay: expect.objectContaining({
          score: expect.any(Number),
          maxScore: expect.any(Number),
          percentage: expect.any(Number),
        }),
        totalScore: expect.any(Number),
        totalMaxScore: 75,
      });
    });
  });

  describe('batchUpdateTrustScores', () => {
    it('should update trust scores for all users', async () => {
      const users = [
        { ...mockUser, id: 'user-1' },
        { ...mockUser, id: 'user-2' },
      ];

      mockPrismaService.user.findMany.mockResolvedValue(users);
      jest.spyOn(service, 'calculateTrustScore').mockResolvedValue({
        userId: 'user-1',
        score: 75,
        breakdown: {} as any,
        lastUpdated: new Date(),
        nextUpdateTime: new Date(),
      });

      const result = await service.batchUpdateTrustScores();

      expect(result).toEqual({ updated: 2, failed: 0 });
      expect(service.calculateTrustScore).toHaveBeenCalledTimes(2);
    });

    it('should handle failures gracefully', async () => {
      const users = [{ ...mockUser, id: 'user-1' }];

      mockPrismaService.user.findMany.mockResolvedValue(users);
      jest.spyOn(service, 'calculateTrustScore').mockRejectedValue(new Error('Test error'));

      const result = await service.batchUpdateTrustScores();

      expect(result).toEqual({ updated: 0, failed: 1 });
    });
  });

  describe('decay algorithm', () => {
    it('should apply decay for inactive users', async () => {
      const inactiveUser = {
        ...mockUser,
        lastActivityAt: new Date(Date.now() - 90 * 86400000), // 3 months inactive
      };
      mockPrismaService.user.findUnique.mockResolvedValue(inactiveUser);
      mockPrismaService.verificationDocument.findFirst.mockResolvedValue(null);

      const result = await service.calculateTrustScore('user-123');

      expect(result.breakdown.activityDecay.percentage).toBeLessThan(100);
    });
  });

  describe('recalculateOnEvent', () => {
    it('should recalculate on transaction completion', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.verificationDocument.findFirst.mockResolvedValue(null);
      mockPrismaService.user.update.mockResolvedValue(mockUser);

      const result = await service.recalculateOnEvent('user-123', 'TRANSACTION_COMPLETED');

      expect(result).toBeDefined();
      expect(result.userId).toBe('user-123');
    });
  });
});
