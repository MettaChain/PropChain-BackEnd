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
});
