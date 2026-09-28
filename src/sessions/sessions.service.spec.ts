import { SessionsService } from './sessions.service';
import { PrismaService } from '../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';

describe('SessionsService', () => {
  let service: SessionsService;
  let prisma: jest.Mocked<Partial<PrismaService>>;

  beforeEach(() => {
    prisma = {
      session: {
        count: jest.fn().mockResolvedValue(10),
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        updateMany: jest.fn(),
      } as any,
    };
    service = new SessionsService(
      prisma as unknown as PrismaService,
      { get: jest.fn().mockReturnValue(5) } as unknown as ConfigService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('createSession throws ConflictException when max sessions reached', async () => {
    await expect(service.createSession('user-1', 'jti-1', 'rjti-1')).rejects.toThrow(
      ConflictException,
    );
  });

  describe('session revocation broadcast (#1294)', () => {
    it('publishes the revoked session id', async () => {
      const scopedPrisma: any = {
        session: {
          findUnique: jest.fn().mockResolvedValue({ id: 'sess-1', userId: 'user-1' }),
          update: jest.fn().mockResolvedValue({ id: 'sess-1' }),
        },
      };
      const revocation = { publishRevoked: jest.fn().mockResolvedValue(undefined) };
      const scoped = new SessionsService(
        scopedPrisma as unknown as PrismaService,
        { get: jest.fn().mockReturnValue(5) } as unknown as ConfigService,
        revocation as any,
      );

      await scoped.revokeSession('user-1', 'sess-1');

      expect(revocation.publishRevoked).toHaveBeenCalledWith(['sess-1']);
    });

    it('publishes every revoked session id on revokeAllSessions', async () => {
      const scopedPrisma: any = {
        session: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 's1',
              userId: 'user-1',
              accessTokenJti: 'a1',
              refreshTokenJti: 'r1',
              expiresAt: new Date(),
            },
            {
              id: 's2',
              userId: 'user-1',
              accessTokenJti: 'a2',
              refreshTokenJti: 'r2',
              expiresAt: new Date(),
            },
          ]),
          updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
        blacklistedToken: { createMany: jest.fn().mockResolvedValue({ count: 4 }) },
      };
      const revocation = { publishRevoked: jest.fn().mockResolvedValue(undefined) };
      const scoped = new SessionsService(
        scopedPrisma as unknown as PrismaService,
        { get: jest.fn().mockReturnValue(5) } as unknown as ConfigService,
        revocation as any,
      );

      await scoped.revokeAllSessions('user-1');

      expect(revocation.publishRevoked).toHaveBeenCalledWith(['s1', 's2']);
    });
  });
});
