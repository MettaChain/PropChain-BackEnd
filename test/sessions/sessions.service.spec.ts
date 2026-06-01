import { Test, TestingModule } from '@nestjs/testing';
import { SessionsService } from '../../src/sessions/sessions.service';
import { PrismaService } from '../../src/database/prisma.service';

describe('SessionsService', () => {
  let service: SessionsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    session: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    blacklistedToken: {
      createMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<SessionsService>(SessionsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('revokes all active sessions and blacklists session tokens', async () => {
    mockPrismaService.session.findMany.mockResolvedValue([
      {
        id: 'session-1',
        accessTokenJti: 'access-jti-1',
        refreshTokenJti: 'refresh-jti-1',
        expiresAt: new Date('2099-01-01T00:00:00Z'),
        isRevoked: false,
      },
    ]);
    mockPrismaService.session.updateMany.mockResolvedValue({ count: 1 });
    mockPrismaService.blacklistedToken.createMany.mockResolvedValue({ count: 2 });

    const result = await service.revokeAllSessions('user-123');

    expect(prisma.blacklistedToken.createMany).toHaveBeenCalledWith({
      data: [
        {
          jti: 'access-jti-1',
          tokenType: 'ACCESS',
          expiresAt: new Date('2099-01-01T00:00:00Z'),
          userId: 'user-123',
        },
        {
          jti: 'refresh-jti-1',
          tokenType: 'REFRESH',
          expiresAt: new Date('2099-01-01T00:00:00Z'),
          userId: 'user-123',
        },
      ],
      skipDuplicates: true,
    });
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-123', isRevoked: false },
      data: { isRevoked: true, revokedAt: expect.any(Date) },
    });
    expect(result).toEqual({
      message: 'All sessions revoked successfully',
      revokedCount: 1,
    });
  });

  it('does not blacklist tokens when there are no active sessions', async () => {
    mockPrismaService.session.findMany.mockResolvedValue([]);
    mockPrismaService.session.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.revokeAllSessions('user-123');

    expect(prisma.blacklistedToken.createMany).not.toHaveBeenCalled();
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-123', isRevoked: false },
      data: { isRevoked: true, revokedAt: expect.any(Date) },
    });
    expect(result).toEqual({
      message: 'All sessions revoked successfully',
      revokedCount: 0,
    });
  });
});
