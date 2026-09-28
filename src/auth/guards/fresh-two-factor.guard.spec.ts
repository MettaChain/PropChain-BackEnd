import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { FreshTwoFactorGuard } from './fresh-two-factor.guard';
import { PrismaService } from '../../database/prisma.service';
import { createSha256, generateTotpCode } from '../security.utils';

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('FreshTwoFactorGuard (#1291)', () => {
  let guard: FreshTwoFactorGuard;

  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new FreshTwoFactorGuard(prisma as unknown as PrismaService);
  });

  it('throws when there is no authenticated user', async () => {
    await expect(guard.canActivate(contextFor({}))).rejects.toThrow(ForbiddenException);
  });

  it('allows the request when 2FA is not enabled', async () => {
    prisma.user.findUnique.mockResolvedValue({
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: [],
    });

    await expect(guard.canActivate(contextFor({ authUser: { sub: 'user-1' } }))).resolves.toBe(
      true,
    );
  });

  it('requires a code when 2FA is enabled', async () => {
    prisma.user.findUnique.mockResolvedValue({
      twoFactorEnabled: true,
      twoFactorSecret: SECRET,
      twoFactorBackupCodes: [],
    });

    await expect(
      guard.canActivate(contextFor({ authUser: { sub: 'user-1' }, headers: {}, body: {} })),
    ).rejects.toThrow(/Fresh two-factor authentication required/);
  });

  it('accepts a current TOTP code from the header', async () => {
    prisma.user.findUnique.mockResolvedValue({
      twoFactorEnabled: true,
      twoFactorSecret: SECRET,
      twoFactorBackupCodes: [],
    });

    await expect(
      guard.canActivate(
        contextFor({
          authUser: { sub: 'user-1' },
          headers: { 'x-2fa-code': generateTotpCode({ secret: SECRET }) },
          body: {},
        }),
      ),
    ).resolves.toBe(true);
  });

  it('accepts a TOTP code from the body as a fallback', async () => {
    prisma.user.findUnique.mockResolvedValue({
      twoFactorEnabled: true,
      twoFactorSecret: SECRET,
      twoFactorBackupCodes: [],
    });

    await expect(
      guard.canActivate(
        contextFor({
          authUser: { sub: 'user-1' },
          headers: {},
          body: { totpCode: generateTotpCode({ secret: SECRET }) },
        }),
      ),
    ).resolves.toBe(true);
  });

  it('rejects an invalid code', async () => {
    prisma.user.findUnique.mockResolvedValue({
      twoFactorEnabled: true,
      twoFactorSecret: SECRET,
      twoFactorBackupCodes: [],
    });

    await expect(
      guard.canActivate(
        contextFor({ authUser: { sub: 'user-1' }, headers: {}, body: { code: '000000' } }),
      ),
    ).rejects.toThrow(/Invalid two-factor authentication code/);
  });

  it('consumes a valid recovery code so it cannot be reused', async () => {
    const recoveryCode = 'ABCD1234';
    const hash = createSha256(recoveryCode);
    prisma.user.findUnique.mockResolvedValue({
      twoFactorEnabled: true,
      twoFactorSecret: SECRET,
      twoFactorBackupCodes: [hash],
    });
    prisma.user.update.mockResolvedValue({});

    await expect(
      guard.canActivate(
        contextFor({ authUser: { sub: 'user-1' }, headers: {}, body: { code: recoveryCode } }),
      ),
    ).resolves.toBe(true);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { twoFactorBackupCodes: { set: [] } },
    });
  });
});
