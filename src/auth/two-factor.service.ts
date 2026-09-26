import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  createSha256,
  generateBackupCodes,
  randomToken,
  verifyBackupCode,
  verifyTotpCode,
} from './security.utils';

/**
 * Trusted-device and recovery-code handling for TOTP two-factor auth (#1291).
 *
 * Trusted devices let a user skip the TOTP challenge on hardware they have
 * explicitly remembered after a successful second-factor check. Only a
 * SHA-256 hash of the device token is persisted; the raw token is returned to
 * the client exactly once.
 */
export interface TrustedDeviceSummary {
  id: string;
  label: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
}

export interface RememberDeviceOptions {
  label?: string;
  userAgent?: string;
  ipAddress?: string;
}

export const DEFAULT_TRUSTED_DEVICE_TTL_DAYS = 30;

@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Effective trusted-device lifetime in milliseconds. */
  get trustedDeviceTtlMs(): number {
    const parsed = parseInt(process.env.TRUSTED_DEVICE_TTL_DAYS ?? '', 10);
    const days = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TRUSTED_DEVICE_TTL_DAYS;
    return days * 24 * 60 * 60 * 1000;
  }

  /**
   * Return true when the supplied device token belongs to the user, has not
   * been revoked and has not expired. Usage refreshes `lastUsedAt`.
   */
  async isTrustedDevice(userId: string, token?: string | null): Promise<boolean> {
    const normalized = token?.trim();
    if (!normalized) {
      return false;
    }

    const device = await this.prisma.trustedDevice.findUnique({
      where: { tokenHash: createSha256(normalized) },
    });

    if (!device || device.userId !== userId || device.revokedAt) {
      return false;
    }

    if (device.expiresAt <= new Date()) {
      return false;
    }

    await this.prisma.trustedDevice
      .update({ where: { id: device.id }, data: { lastUsedAt: new Date() } })
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to touch trusted device ${device.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });

    return true;
  }

  /**
   * Persist a new trusted device and return the one-time plaintext token plus
   * the device record.
   */
  async rememberDevice(
    userId: string,
    options: RememberDeviceOptions = {},
  ): Promise<{ token: string; device: TrustedDeviceSummary }> {
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + this.trustedDeviceTtlMs);

    const device = await this.prisma.trustedDevice.create({
      data: {
        userId,
        tokenHash: createSha256(token),
        label: options.label ?? null,
        userAgent: options.userAgent ?? null,
        ipAddress: options.ipAddress ?? null,
        expiresAt,
      },
    });

    return { token, device: this.toSummary(device) };
  }

  /** List the user's active (unrevoked, unexpired) trusted devices. */
  async listDevices(userId: string): Promise<TrustedDeviceSummary[]> {
    const devices = await this.prisma.trustedDevice.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    return devices.map((device) => this.toSummary(device));
  }

  /** Revoke a single trusted device. Idempotent for already-revoked devices. */
  async revokeDevice(
    userId: string,
    deviceId: string,
  ): Promise<{ id: string; alreadyRevoked: boolean }> {
    const device = await this.prisma.trustedDevice.findUnique({ where: { id: deviceId } });

    if (!device || device.userId !== userId) {
      throw new NotFoundException('Trusted device not found');
    }

    if (device.revokedAt) {
      return { id: device.id, alreadyRevoked: true };
    }

    await this.prisma.trustedDevice.update({
      where: { id: device.id },
      data: { revokedAt: new Date() },
    });

    return { id: device.id, alreadyRevoked: false };
  }

  /**
   * Revoke every active trusted device for a user. Called whenever the second
   * factor changes (password change, 2FA disable/reset) so previously trusted
   * hardware cannot bypass the new state.
   */
  async revokeAllDevices(userId: string): Promise<number> {
    const result = await this.prisma.trustedDevice.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return result.count;
  }

  /**
   * Issue a fresh set of recovery codes, replacing any existing ones. Returns
   * the plaintext codes once — they are stored only as hashes.
   */
  async regenerateRecoveryCodes(userId: string): Promise<string[]> {
    const codes = generateBackupCodes();
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorBackupCodes: { set: codes.map((code) => createSha256(code)) } },
    });
    return codes;
  }

  /**
   * Verify a fresh TOTP code against the user's secret. Recovery codes are not
   * consumed here — callers that require single-use semantics should consume
   * them explicitly.
   */
  verifyTotp(secret: string, code: string): boolean {
    return verifyTotpCode({ secret, code });
  }

  /** Find a matching recovery code hash, or undefined. */
  matchRecoveryCode(code: string, hashes: string[] | null | undefined): string | undefined {
    return verifyBackupCode(code, hashes ?? []);
  }

  private toSummary(device: {
    id: string;
    label: string | null;
    userAgent: string | null;
    ipAddress: string | null;
    createdAt: Date;
    lastUsedAt: Date | null;
    expiresAt: Date;
  }): TrustedDeviceSummary {
    return {
      id: device.id,
      label: device.label,
      userAgent: device.userAgent,
      ipAddress: device.ipAddress,
      createdAt: device.createdAt,
      lastUsedAt: device.lastUsedAt,
      expiresAt: device.expiresAt,
    };
  }
}
