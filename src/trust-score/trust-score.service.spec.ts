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
          accountAge: expect.objectContaining({
            score: expect.any(Number),
            maxScore: 10,
            percentage: expect.any(Number),
          }),
          emailVerification: expect.objectContaining({
            score: 5,
            maxScore: 5,
            percentage: 100,
          }),
          twoFactorAuth: expect.objectContaining({
            score: 5,
            maxScore: 5,
            percentage: 100,
          }),
          profileCompleteness: expect.objectContaining({
            score: expect.any(Number),
            maxScore: 15,
            percentage: expect.any(Number),
          }),
          transactionHistory: expect.objectContaining({
            score: expect.any(Number),
            maxScore: 25,
            percentage: expect.any(Number),
          }),
          propertyListings: expect.objectContaining({
            score: expect.any(Number),
            maxScore: 15,
            percentage: expect.any(Number),
          }),
          apiKeyUsage: expect.objectContaining({
            score: expect.any(Number),
            maxScore: 10,
            percentage: expect.any(Number),
          }),
          passwordSecurity: expect.objectContaining({
            score: expect.any(Number),
            maxScore: 10,
            percentage: expect.any(Number),
          }),
          totalScore: 0,
          totalMaxScore: 95,
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
      const recentUpdate = new Date(Date.now() - 12 * 3600000); // 12 hours ago
      const userWithRecentUpdate = {
        ...mockUser,
        lastTrustScoreUpdate: recentUpdate,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(userWithRecentUpdate);
      jest.spyOn(service, 'getScoreBreakdown').mockResolvedValue({
        accountAge: { score: 8, maxScore: 10, percentage: 80 },
        emailVerification: { score: 5, maxScore: 5, percentage: 100 },
        twoFactorAuth: { score: 5, maxScore: 5, percentage: 100 },
        profileCompleteness: { score: 12, maxScore: 15, percentage: 80 },
        transactionHistory: { score: 10, maxScore: 25, percentage: 40 },
        propertyListings: { score: 7, maxScore: 15, percentage: 47 },
        apiKeyUsage: { score: 5, maxScore: 10, percentage: 50 },
        passwordSecurity: { score: 10, maxScore: 10, percentage: 100 },
        totalScore: 0,
        totalMaxScore: 95,
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

      const breakdown = await service.getScoreBreakdown('user-123');

      expect(breakdown).toEqual({
        accountAge: expect.objectContaining({
          score: expect.any(Number),
          maxScore: 10,
          percentage: expect.any(Number),
        }),
        emailVerification: { score: 5, maxScore: 5, percentage: 100 },
        twoFactorAuth: { score: 5, maxScore: 5, percentage: 100 },
        profileCompleteness: expect.objectContaining({
          score: expect.any(Number),
          maxScore: 15,
          percentage: expect.any(Number),
        }),
        transactionHistory: expect.objectContaining({
          score: expect.any(Number),
          maxScore: 25,
          percentage: expect.any(Number),
        }),
        propertyListings: expect.objectContaining({
          score: expect.any(Number),
          maxScore: 15,
          percentage: expect.any(Number),
        }),
        apiKeyUsage: expect.objectContaining({
          score: expect.any(Number),
          maxScore: 10,
          percentage: expect.any(Number),
        }),
        passwordSecurity: expect.objectContaining({
          score: expect.any(Number),
          maxScore: 10,
          percentage: expect.any(Number),
        }),
        totalScore: 0,
        totalMaxScore: 95,
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

  describe('calculateAccountAge', () => {
    it('should calculate correct account age scores', async () => {
      const oldUser = {
        ...mockUser,
        createdAt: new Date('2022-01-01'), // Over 1 year old
      };
      mockPrismaService.user.findUnique.mockResolvedValue(oldUser);

      const breakdown = await service.getScoreBreakdown('user-123');
      expect(breakdown.accountAge.score).toBe(10);

      const newUser = {
        ...mockUser,
        createdAt: new Date(Date.now() - 30 * 86400000), // 30 days old
      };
      mockPrismaService.user.findUnique.mockResolvedValue(newUser);

      const newBreakdown = await service.getScoreBreakdown('user-123');
      expect(newBreakdown.accountAge.score).toBe(4);
    });
  });

  describe('calculateProfileCompleteness', () => {
    it('should score profile completeness correctly', async () => {
      const incompleteUser = {
        ...mockUser,
        firstName: 'John',
        lastName: null,
        phone: null,
        avatar: null,
      };
      mockPrismaService.user.findUnique.mockResolvedValue(incompleteUser);

      const breakdown = await service.getScoreBreakdown('user-123');
      expect(breakdown.profileCompleteness.score).toBe(6); // firstName + email
    });
  });
});
