import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../database/prisma.service';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import {
  ChangePasswordDto,
  CreateApiKeyDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
  VerifyTwoFactorDto,
} from './dto/auth.dto';
import {
  buildOtpAuthUrl,
  buildQrCodeUrl,
  comparePassword,
  createSha256,
  generateBackupCodes,
  getPasswordHistoryLimit,
  hashPassword,
  parseDuration,
  randomBase32Secret,
  randomToken,
  sanitizeUser,
  verifyBackupCode,
  verifyTotpCode,
} from './security.utils';
import { AuthUserPayload } from './types/auth-user.type';

import { UserRole } from '@prisma/client';

type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
  type: 'access' | 'refresh';
  jti: string;
  exp?: number;
};

@Injectable()
export class AuthService {
  private readonly issuer = 'PropChain';
  private readonly accessTokenTtlSeconds: number;
  private readonly refreshTokenTtlSeconds: number;
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;
  private readonly bcryptRounds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {
    this.jwtSecret = this.configService.get<string>('JWT_SECRET') ?? 'propchain-access-secret';
    this.jwtRefreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ?? 'propchain-refresh-secret';
    this.accessTokenTtlSeconds = parseDuration(
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
      15 * 60,
    );
    this.refreshTokenTtlSeconds = parseDuration(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
      7 * 24 * 60 * 60,
    );
    this.bcryptRounds = parseInt(this.configService.get<string>('BCRYPT_ROUNDS') ?? '12', 10);
  }

  async register(data: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(data.email);
    if (existingUser) {
      throw new BadRequestException('A user with that email already exists');
    }

    const passwordHash = await hashPassword(data.password, this.bcryptRounds);
    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        password: passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        passwordHistory: {
          create: {
            passwordHash,
          },
        },
      },
    });

    const tokens = await this.issueTokenPair(user);
    return {
      user: sanitizeUser(user),
      ...tokens,
    };
  }

  async login(data: LoginDto) {
    const user = await this.usersService.findByEmail(data.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.isBlocked) {
      throw new UnauthorizedException('Your account has been blocked. Please contact support.');
    }

    const passwordMatches = await comparePassword(data.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.twoFactorEnabled) {
      const hasTotpCode = Boolean(data.totpCode?.trim());
      const hasBackupCode = Boolean(data.backupCode?.trim());

      if (!hasTotpCode && !hasBackupCode) {
        throw new UnauthorizedException('Two-factor authentication code required');
      }

      if (hasTotpCode && user.twoFactorSecret) {
        const validCode = verifyTotpCode({
          secret: user.twoFactorSecret,
          code: data.totpCode!,
        });

        if (!validCode) {
          throw new UnauthorizedException('Invalid two-factor authentication code');
        }
      } else if (hasBackupCode) {
        const matchingBackupCode = verifyBackupCode(data.backupCode!, user.twoFactorBackupCodes);
        if (!matchingBackupCode) {
          throw new UnauthorizedException('Invalid backup code');
        }

        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            twoFactorBackupCodes: {
              set: user.twoFactorBackupCodes.filter((code: string) => code !== matchingBackupCode),
            },
          },
        });
      }
    }

    const tokens = await this.issueTokenPair(user);
    return {
      user: sanitizeUser(user),
      ...tokens,
    };
  }

  async refreshToken(data: RefreshTokenDto) {
    const payload = this.verifyToken(data.refreshToken, this.jwtRefreshSecret) as JwtPayload;

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.ensureTokenNotBlacklisted(payload.jti);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    if (user.isBlocked) {
      throw new UnauthorizedException('Your account has been blocked');
    }

    if (user.id !== payload.sub) {
      throw new UnauthorizedException('Refresh token does not match the authenticated user');
    }

    await this.blacklistToken({
      jti: payload.jti,
      tokenType: 'REFRESH',
      expiresAt: new Date((payload.exp ?? 0) * 1000),
      userId: user.id,
    });

    const tokens = await this.issueTokenPair(user);
    return {
      user: sanitizeUser(user),
      ...tokens,
    };
  }

  async logout(user: AuthUserPayload, refreshToken?: string, accessToken?: string) {
    if (accessToken) {
      const accessPayload = this.verifyToken(accessToken, this.jwtSecret) as JwtPayload;
      await this.blacklistToken({
        jti: accessPayload.jti,
        tokenType: 'ACCESS',
        expiresAt: new Date((accessPayload.exp ?? 0) * 1000),
        userId: user.sub,
      });
    }

    if (refreshToken) {
      const refreshPayload = this.verifyToken(refreshToken, this.jwtRefreshSecret) as JwtPayload;
      if (refreshPayload.sub !== user.sub) {
        throw new UnauthorizedException('Refresh token does not belong to the current user');
      }

      await this.blacklistToken({
        jti: refreshPayload.jti,
        tokenType: 'REFRESH',
        expiresAt: new Date((refreshPayload.exp ?? 0) * 1000),
        userId: user.sub,
      });
    }

    return { message: 'Logged out successfully' };
  }

  async me(user: AuthUserPayload) {
    const foundUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
    });

    if (!foundUser) {
      throw new NotFoundException('User not found');
    }

    return sanitizeUser(foundUser);
  }

  async changePassword(user: AuthUserPayload, data: ChangePasswordDto) {
    const passwordHistoryLimit = getPasswordHistoryLimit();
    const existingUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      include: {
        passwordHistory: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    const currentPasswordMatches = await comparePassword(
      data.currentPassword,
      existingUser.password,
    );
    if (!currentPasswordMatches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordReused = await Promise.all(
      existingUser.passwordHistory
        .slice(0, passwordHistoryLimit)
        .map((entry: { passwordHash: string }) =>
          comparePassword(data.newPassword, entry.passwordHash),
        ),
    );

    if (passwordReused.some(Boolean)) {
      throw new BadRequestException(
        `Password reuse is not allowed for the last ${passwordHistoryLimit} passwords`,
      );
    }

    const newPasswordHash = await hashPassword(data.newPassword, this.bcryptRounds);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.update({
        where: { id: existingUser.id },
        data: {
          password: newPasswordHash,
        },
      });

      await tx.passwordHistory.create({
        data: {
          userId: existingUser.id,
          passwordHash: newPasswordHash,
        },
      });

      const historyEntries = await tx.passwordHistory.findMany({
        where: { userId: existingUser.id },
        orderBy: { createdAt: 'desc' },
        skip: passwordHistoryLimit,
      });

      if (historyEntries.length > 0) {
        await tx.passwordHistory.deleteMany({
          where: {
            id: {
              in: historyEntries.map((entry: { id: string }) => entry.id),
            },
          },
        });
      }
    });

    return { message: 'Password updated successfully' };
  }

  async setupTwoFactor(user: AuthUserPayload) {
    const foundUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
    });

    if (!foundUser) {
      throw new NotFoundException('User not found');
    }

    const secret = randomBase32Secret();
    const backupCodes = generateBackupCodes();
    const hashedBackupCodes = backupCodes.map((code) => createSha256(code));
    const otpAuthUrl = buildOtpAuthUrl(foundUser.email, secret, this.issuer);

    await this.prisma.user.update({
      where: { id: foundUser.id },
      data: {
        twoFactorSecret: secret,
        twoFactorEnabled: false,
        twoFactorBackupCodes: {
          set: hashedBackupCodes,
        },
      },
    });

    return {
      secret,
      otpAuthUrl,
      qrCodeUrl: buildQrCodeUrl(otpAuthUrl),
      backupCodes,
    };
  }

  async verifyTwoFactor(user: AuthUserPayload, data: VerifyTwoFactorDto) {
    const foundUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
    });

    if (!foundUser?.twoFactorSecret) {
      throw new BadRequestException('Two-factor authentication has not been initialized');
    }

    const validCode = verifyTotpCode({
      secret: foundUser.twoFactorSecret,
      code: data.code,
    });
    if (!validCode) {
      throw new UnauthorizedException('Invalid two-factor authentication code');
    }

    await this.prisma.user.update({
      where: { id: foundUser.id },
      data: {
        twoFactorEnabled: true,
      },
    });

    return { message: 'Two-factor authentication enabled successfully' };
  }

  async disableTwoFactor(user: AuthUserPayload, password: string) {
    const foundUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
    });

    if (!foundUser) {
      throw new NotFoundException('User not found');
    }

    const passwordMatches = await comparePassword(password, foundUser.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Password is incorrect');
    }

    await this.prisma.user.update({
      where: { id: foundUser.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: {
          set: [],
        },
      },
    });

    return { message: 'Two-factor authentication disabled successfully' };
  }

  async createApiKey(user: AuthUserPayload, data: CreateApiKeyDto) {
    const apiKeyValue = this.generateApiKeyValue();
    const record = await this.prisma.apiKey.create({
      data: {
        userId: user.sub,
        name: data.name,
        keyPrefix: apiKeyValue.slice(0, 12),
        keyHash: createSha256(apiKeyValue),
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
    });

    return {
      apiKey: apiKeyValue,
      details: this.toApiKeyResponse(record),
    };
  }

  async listApiKeys(user: AuthUserPayload) {
    const apiKeys = await this.prisma.apiKey.findMany({
      where: { userId: user.sub },
      orderBy: { createdAt: 'desc' },
    });

    return apiKeys.map((apiKey: any) => this.toApiKeyResponse(apiKey));
  }

  async rotateApiKey(user: AuthUserPayload, apiKeyId: string) {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: {
        id: apiKeyId,
        userId: user.sub,
      },
    });

    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: {
        revokedAt: new Date(),
      },
    });

    return this.createApiKey(user, {
      name: apiKey.name,
      expiresAt: apiKey.expiresAt?.toISOString(),
    });
  }

  async revokeApiKey(user: AuthUserPayload, apiKeyId: string) {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: {
        id: apiKeyId,
        userId: user.sub,
      },
    });

    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: {
        revokedAt: new Date(),
      },
    });

    return { message: 'API key revoked successfully' };
  }

  async validateAccessToken(token: string): Promise<AuthUserPayload> {
    const payload = this.verifyToken(token, this.jwtSecret) as JwtPayload;

    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid access token');
    }

    await this.ensureTokenNotBlacklisted(payload.jti);

    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      type: 'access',
      jti: payload.jti,
    };
  }

  async validateApiKey(apiKeyValue: string): Promise<AuthUserPayload> {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: {
        keyHash: createSha256(apiKeyValue),
      },
      include: {
        user: true,
      },
    });

    if (!apiKey || apiKey.revokedAt || (apiKey.expiresAt && apiKey.expiresAt < new Date())) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (apiKey.user.isBlocked) {
      throw new UnauthorizedException('User account is blocked');
    }

    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: {
        lastUsedAt: new Date(),
      },
    });

    return {
      sub: apiKey.userId,
      email: apiKey.user.email,
      role: apiKey.user.role,
      type: 'api-key',
      apiKeyId: apiKey.id,
    };
  }

  private async issueTokenPair(user: any) {
    const accessJti = randomUUID();
    const refreshJti = randomUUID();

    const accessToken = this.signToken(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        type: 'access',
        jti: accessJti,
      },
      this.jwtSecret,
      this.accessTokenTtlSeconds,
    );

    const refreshToken = this.signToken(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        type: 'refresh',
        jti: refreshJti,
      },
      this.jwtRefreshSecret,
      this.refreshTokenTtlSeconds,
    );

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: this.accessTokenTtlSeconds,
      refreshTokenExpiresIn: this.refreshTokenTtlSeconds,
    };
  }

  private signToken(payload: JwtPayload, secret: string, expiresInSeconds: number) {
    return jwt.sign(payload, secret, {
      expiresIn: expiresInSeconds,
      issuer: this.issuer,
    });
  }

  private verifyToken(token: string, secret: string) {
    try {
      return jwt.verify(token, secret, {
        issuer: this.issuer,
      }) as JwtPayload & { exp?: number };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private async ensureTokenNotBlacklisted(jti: string) {
    const blacklistedToken = await this.prisma.blacklistedToken.findUnique({
      where: { jti },
    });

    if (blacklistedToken) {
      throw new UnauthorizedException('Token has been revoked');
    }
  }

  private async blacklistToken(data: {
    jti: string;
    tokenType: 'ACCESS' | 'REFRESH';
    expiresAt: Date;
    userId?: string;
  }) {
    await this.prisma.blacklistedToken.upsert({
      where: { jti: data.jti },
      update: {
        expiresAt: data.expiresAt,
        tokenType: data.tokenType,
        userId: data.userId,
      },
      create: data,
    });
  }

  private generateApiKeyValue() {
    return `pc_${randomToken(24)}`;
  }

  private toApiKeyResponse(apiKey: any) {
    return {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      lastUsedAt: apiKey.lastUsedAt,
      expiresAt: apiKey.expiresAt,
      revokedAt: apiKey.revokedAt,
      createdAt: apiKey.createdAt,
      updatedAt: apiKey.updatedAt,
    };
  }

  async requestPasswordReset(data: RequestPasswordResetDto): Promise<void> {
    const user = await this.usersService.findByEmail(data.email);
    if (!user) {
      // Don't reveal if email exists or not for security
      return;
    }

    if (user.isBlocked) {
      // Don't send reset emails to blocked users
      return;
    }

    // Invalidate any existing reset tokens for this user
    await this.prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        expiresAt: new Date(), // Expire immediately
      },
    });

    // Generate new reset token
    const resetToken = randomToken(32);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: resetToken,
        expiresAt,
      },
    });

    // Send reset email
    await this.emailService.sendPasswordResetEmail(user.email, resetToken);
  }

  async resetPassword(data: ResetPasswordDto): Promise<void> {
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token: data.token },
      include: { user: true },
    });

    if (!resetToken) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (resetToken.usedAt) {
      throw new BadRequestException('Reset token has already been used');
    }

    if (resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    if (resetToken.user.isBlocked) {
      throw new BadRequestException('Account is blocked');
    }

    const passwordHistoryLimit = getPasswordHistoryLimit();

    // Check if new password was used recently
    const recentPasswords = await this.prisma.passwordHistory.findMany({
      where: { userId: resetToken.userId },
      orderBy: { createdAt: 'desc' },
      take: passwordHistoryLimit,
    });

    for (const historyEntry of recentPasswords) {
      const isReused = await comparePassword(data.newPassword, historyEntry.passwordHash);
      if (isReused) {
        throw new BadRequestException(
          `Password reuse is not allowed for the last ${passwordHistoryLimit} passwords`,
        );
      }
    }

    const newPasswordHash = await hashPassword(data.newPassword, this.bcryptRounds);

    // Update password and mark token as used in a transaction
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.update({
        where: { id: resetToken.userId },
        data: { password: newPasswordHash },
      });

      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      });

      await tx.passwordHistory.create({
        data: {
          userId: resetToken.userId,
          passwordHash: newPasswordHash,
        },
      });

      // Clean up old password history entries
      const historyEntries = await tx.passwordHistory.findMany({
        where: { userId: resetToken.userId },
        orderBy: { createdAt: 'desc' },
        skip: passwordHistoryLimit,
      });

      if (historyEntries.length > 0) {
        await tx.passwordHistory.deleteMany({
          where: {
            id: { in: historyEntries.map((entry: { id: string }) => entry.id) },
          },
        });
      }
    });
  }

  /**
   * Validates or creates a user from a Facebook OAuth2 profile.
   * Links Facebook account to existing user if email matches,
   * otherwise creates a new account.
   */
  async validateFacebookUser(profile: {
    facebookId: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
  }) {
    // Check if user already linked this Facebook account
    const existingByFacebookId = await this.prisma.user.findUnique({
      where: { facebookId: profile.facebookId },
    });

    if (existingByFacebookId) {
      return existingByFacebookId;
    }

    // Check if user exists with same email — link accounts
    if (profile.email) {
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });

      if (existingByEmail) {
        return this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            facebookId: profile.facebookId,
            avatar: existingByEmail.avatar ?? profile.avatar,
            isVerified: true,
          },
        });
      }
    }

    // Create new account from Facebook profile
    return this.prisma.user.create({
      data: {
        email: profile.email ?? `fb_${profile.facebookId}@facebook.com`,
        password: await hashPassword(randomToken(32), this.bcryptRounds),
        firstName: profile.firstName ?? 'Facebook',
        lastName: profile.lastName ?? 'User',
        facebookId: profile.facebookId,
        avatar: profile.avatar,
        isVerified: true,
      },
    });
  }

  /**
   * Handle Facebook OAuth2 login — issues JWT tokens for the user.
   */
  async facebookLogin(user: any) {
    const tokens = await this.issueTokenPair(user);
    return {
      user: sanitizeUser(user),
      ...tokens,
    };
  }
}
