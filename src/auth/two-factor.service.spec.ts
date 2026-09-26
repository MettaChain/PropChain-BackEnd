import { NotFoundException } from '@nestjs/common';
import { TwoFactorService } from './two-factor.service';
import { PrismaService } from '../database/prisma.service';
import { createSha256 } from './security.utils';

describe('TwoFactorService (#1291)', () => {
  let service: TwoFactorService;

  const prisma = {
    trustedDevice: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TwoFactorService(prisma as unknown as PrismaService);
  });

  describe('isTrustedDevice', () => {
    const baseDevice = {
      id: 'device-1',
      userId: 'user-1',
      tokenHash: createSha256('device-token'),
      label: null,
      userAgent: null,
      ipAddress: null,
      createdAt: new Date(),
      lastUsedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null as Date | null,
    };

    it('returns false for missing or blank tokens without querying', async () => {
      expect(await service.isTrustedDevice('user-1', undefined)).toBe(false);
      expect(await service.isTrustedDevice('user-1', '   ')).toBe(false);
      expect(prisma.trustedDevice.findUnique).not.toHaveBeenCalled();
    });

    it('accepts a valid device token and refreshes lastUsedAt', async () => {
      prisma.trustedDevice.findUnique.mockResolvedValue(baseDevice);
      prisma.trustedDevice.update.mockResolvedValue(baseDevice);

      expect(await service.isTrustedDevice('user-1', 'device-token')).toBe(true);
      expect(prisma.trustedDevice.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: createSha256('device-token') },
      });
      expect(prisma.trustedDevice.update).toHaveBeenCalledWith({
        where: { id: 'device-1' },
        data: { lastUsedAt: expect.any(Date) },
      });
    });

    it('rejects a token that belongs to a different user', async () => {
      prisma.trustedDevice.findUnique.mockResolvedValue({ ...baseDevice, userId: 'someone-else' });

      expect(await service.isTrustedDevice('user-1', 'device-token')).toBe(false);
    });

    it('rejects revoked and expired devices', async () => {
      prisma.trustedDevice.findUnique.mockResolvedValue({ ...baseDevice, revokedAt: new Date() });
      expect(await service.isTrustedDevice('user-1', 'device-token')).toBe(false);

      prisma.trustedDevice.findUnique.mockResolvedValue({
        ...baseDevice,
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(await service.isTrustedDevice('user-1', 'device-token')).toBe(false);
    });
  });

  describe('rememberDevice', () => {
    it('stores only a hash and returns the one-time token', async () => {
      prisma.trustedDevice.create.mockImplementation(async ({ data }: any) => ({
        id: 'device-2',
        ...data,
      }));

      const { token, device } = await service.rememberDevice('user-1', {
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
      });

      expect(token).toEqual(expect.any(String));
      expect(token.length).toBeGreaterThan(20);

      const createArgs = prisma.trustedDevice.create.mock.calls[0][0];
      expect(createArgs.data.tokenHash).toBe(createSha256(token));
      expect(createArgs.data.userId).toBe('user-1');
      expect(createArgs.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(device.id).toBe('device-2');
      expect(device).not.toHaveProperty('tokenHash');
    });
  });

  describe('revokeDevice', () => {
    it('throws for an unknown device', async () => {
      prisma.trustedDevice.findUnique.mockResolvedValue(null);
      await expect(service.revokeDevice('user-1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('forbids revoking another user\u2019s device', async () => {
      prisma.trustedDevice.findUnique.mockResolvedValue({ id: 'd', userId: 'owner' });
      await expect(service.revokeDevice('intruder', 'd')).rejects.toThrow(NotFoundException);
    });

    it('revokes an active device exactly once', async () => {
      prisma.trustedDevice.findUnique.mockResolvedValue({
        id: 'd',
        userId: 'user-1',
        revokedAt: null,
      });
      prisma.trustedDevice.update.mockResolvedValue({});

      const result = await service.revokeDevice('user-1', 'd');
      expect(result).toEqual({ id: 'd', alreadyRevoked: false });
      expect(prisma.trustedDevice.update).toHaveBeenCalledWith({
        where: { id: 'd' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('is idempotent for an already-revoked device', async () => {
      prisma.trustedDevice.findUnique.mockResolvedValue({
        id: 'd',
        userId: 'user-1',
        revokedAt: new Date(),
      });

      const result = await service.revokeDevice('user-1', 'd');
      expect(result.alreadyRevoked).toBe(true);
      expect(prisma.trustedDevice.update).not.toHaveBeenCalled();
    });
  });

  it('revokeAllDevices revokes only active devices and returns the count', async () => {
    prisma.trustedDevice.updateMany.mockResolvedValue({ count: 3 });

    expect(await service.revokeAllDevices('user-1')).toBe(3);
    expect(prisma.trustedDevice.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('regenerateRecoveryCodes stores hashes and returns plaintext codes', async () => {
    prisma.user.update.mockResolvedValue({});

    const codes = await service.regenerateRecoveryCodes('user-1');

    expect(codes).toHaveLength(8);
    const updateArgs = prisma.user.update.mock.calls[0][0];
    expect(updateArgs.data.twoFactorBackupCodes.set).toHaveLength(8);
    expect(updateArgs.data.twoFactorBackupCodes.set[0]).toBe(createSha256(codes[0]));
  });

  it('matches a recovery code against stored hashes', () => {
    const codes = ['ABCD1234', 'EFGH5678'];
    const hashes = codes.map(createSha256);

    expect(service.matchRecoveryCode('abcd1234', hashes)).toBe(hashes[0]);
    expect(service.matchRecoveryCode('nope', hashes)).toBeUndefined();
  });
});
