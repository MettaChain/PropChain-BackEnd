import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { verifyBackupCode, verifyTotpCode } from '../security.utils';

/**
 * Guard for high-risk operations (issue #1291).
 *
 * When the authenticated user has two-factor authentication enabled, the
 * request must carry a fresh second factor — either a current TOTP code or an
 * unused recovery code — in the `x-2fa-code` header (or a `totpCode` /
 * `twoFactorCode` / `code` body field). This ensures that a trusted-device
 * session or a stale access token cannot, on its own, perform sensitive
 * actions such as changing the password or disabling 2FA.
 *
 * Users without 2FA enabled are unaffected.
 *
 * Must be used together with `JwtAuthGuard` and listed after it so that
 * `request.authUser` is populated first.
 */
@Injectable()
export class FreshTwoFactorGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authUser = request.authUser as { sub?: string } | undefined;

    if (!authUser?.sub) {
      throw new ForbiddenException('Authentication required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: authUser.sub },
      select: {
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorBackupCodes: true,
      },
    });

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Nothing to enforce when the user has not enabled 2FA.
    if (!user.twoFactorEnabled) {
      return true;
    }

    const code = this.extractCode(request);
    if (!code) {
      throw new ForbiddenException(
        'Fresh two-factor authentication required. Provide a current TOTP or recovery code.',
      );
    }

    if (user.twoFactorSecret && verifyTotpCode({ secret: user.twoFactorSecret, code })) {
      return true;
    }

    const matchingRecoveryCode = verifyBackupCode(code, user.twoFactorBackupCodes ?? []);
    if (matchingRecoveryCode) {
      // Recovery codes are single-use — consume it before allowing the action.
      await this.prisma.user.update({
        where: { id: authUser.sub },
        data: {
          twoFactorBackupCodes: {
            set: (user.twoFactorBackupCodes ?? []).filter((hash) => hash !== matchingRecoveryCode),
          },
        },
      });
      return true;
    }

    throw new ForbiddenException('Invalid two-factor authentication code');
  }

  private extractCode(request: {
    headers?: Record<string, unknown>;
    body?: Record<string, unknown>;
  }): string | undefined {
    const header = request.headers?.['x-2fa-code'];
    if (typeof header === 'string' && header.trim()) {
      return header.trim();
    }

    const body = request.body ?? {};
    for (const key of ['totpCode', 'twoFactorCode', 'code']) {
      const value = body[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return undefined;
  }
}
