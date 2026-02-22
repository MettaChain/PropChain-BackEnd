import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/services/redis.service';
import { StructuredLoggerService } from '../../common/logging/logger.service';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';

@Injectable()
export class MfaService {
  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly logger: StructuredLoggerService,
  ) {
    this.logger.setContext('MfaService');
  }

  async generateMfaSecret(userId: string, email: string): Promise<{ secret: string; qrCode: string }> {
    // Generate a new secret
    const secret = speakeasy.generateSecret({
      name: `PropChain (${email})`,
      issuer: 'PropChain',
    });

    // Generate QR code for authenticator apps
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);

    // Store the secret temporarily (will be confirmed during setup)
    const expiry = this.configService.get<number>('MFA_CODE_EXPIRY', 300);
    await this.redisService.setex(`mfa_setup:${userId}`, expiry, secret.base32);

    this.logger.logAuth('MFA secret generated', { userId });

    return {
      secret: secret.base32,
      qrCode,
    };
  }

  async verifyMfaSetup(userId: string, token: string): Promise<boolean> {
    const secret = await this.redisService.get(`mfa_setup:${userId}`);

    if (!secret) {
      throw new BadRequestException('MFA setup session expired or not found');
    }

    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2, // Allow 2 time periods of tolerance
    });

    if (verified) {
      // Store the confirmed secret
      await this.redisService.set(`mfa_secret:${userId}`, secret);
      await this.redisService.del(`mfa_setup:${userId}`);
      this.logger.logAuth('MFA setup completed', { userId });
    } else {
      this.logger.warn('MFA setup verification failed', { userId });
    }

    return verified;
  }

  async verifyMfaToken(userId: string, token: string): Promise<boolean> {
    const secret = await this.redisService.get(`mfa_secret:${userId}`);

    if (!secret) {
      throw new UnauthorizedException('MFA not enabled for this user');
    }

    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2,
    });

    if (verified) {
      // Store successful verification to prevent replay attacks
      const expiry = this.configService.get<number>('MFA_CODE_EXPIRY', 300);
      await this.redisService.setex(`mfa_verified:${userId}:${token}`, expiry, '1');
      this.logger.logAuth('MFA token verified', { userId });
    } else {
      this.logger.warn('MFA token verification failed', { userId });
    }

    return verified;
  }

  async isMfaEnabled(userId: string): Promise<boolean> {
    const secret = await this.redisService.get(`mfa_secret:${userId}`);
    return secret !== null;
  }

  async disableMfa(userId: string): Promise<void> {
    await this.redisService.del(`mfa_secret:${userId}`);
    await this.redisService.del(`mfa_backup_codes:${userId}`);
    this.logger.logAuth('MFA disabled', { userId });
  }

  async generateBackupCodes(userId: string): Promise<string[]> {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      // Generate 8-character backup codes
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      codes.push(code);
    }

    // Store backup codes with hash for security
    const expiry = this.configService.get<number>('MFA_CODE_EXPIRY', 300) * 12; // 1 hour * 12 = 12 hours
    await this.redisService.setex(`mfa_backup_codes:${userId}`, expiry, JSON.stringify(codes));

    this.logger.logAuth('MFA backup codes generated', { userId });
    return codes;
  }

  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    const codesData = await this.redisService.get(`mfa_backup_codes:${userId}`);

    if (!codesData) {
      return false;
    }

    const codes = JSON.parse(codesData);
    const index = codes.indexOf(code.toUpperCase());

    if (index !== -1) {
      // Remove used code
      codes.splice(index, 1);
      await this.redisService.set(`mfa_backup_codes:${userId}`, JSON.stringify(codes));
      this.logger.logAuth('MFA backup code used', { userId });
      return true;
    }

    return false;
  }

  async getMfaStatus(userId: string): Promise<{ enabled: boolean; hasBackupCodes: boolean }> {
    const enabled = await this.isMfaEnabled(userId);
    const backupCodes = await this.redisService.get(`mfa_backup_codes:${userId}`);
    const hasBackupCodes = backupCodes !== null && JSON.parse(backupCodes).length > 0;

    return {
      enabled,
      hasBackupCodes,
    };
  }
}
