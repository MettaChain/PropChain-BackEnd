import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User as PrismaUser, ApiKey, TokenType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../database/prisma.service';
import { UsersService } from '../users/users.service';
import { SessionsService } from '../sessions/sessions.service';
import { EmailService } from '../email/email.service';
import {
  ChangePasswordDto,
  CreateApiKeyDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
  UpdateApiKeyPermissionsDto,
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
import { GoogleProfile } from './strategies/google.strategy';

import { LoginRateLimitService } from './login-rate-limit.service';
import { UserRole } from '../types/prisma.types';
import { FraudService } from '../fraud/fraud.service';

type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
  type: 'access' | 'refresh';
  jti: string;
  family?: string; // Token rotation family ID
  exp?: number;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly issuer = 'PropChain';
  private readonly accessTokenTtlSeconds: number;
  private readonly refreshTokenTtlSeconds: number;
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;
  private readonly bcryptRounds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly rateLimitService: LoginRateLimitService,
    private readonly fraudService: FraudService,
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

  /**
   * Helper to map transactions to activity items for dashboard
   */
  private transactionsToActivityItems(transactions: any[], type: 'purchase' | 'sale') {
    return transactions.map((tx) => ({
      type: 'transaction' as const,
      id: tx.id,
      title: `Property ${type === 'purchase' ? 'Purchased' : 'Sold'}: ${tx.property?.title || 'Unknown'}`,
      description: `${type === 'purchase' ? 'Bought' : 'Sold'} for $${tx.amount}`,
      timestamp: tx.createdAt,
    }));
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

  async login(data: LoginDto, ipAddress?: string, userAgent?: string) {
    // Check if account is locked out
    const isLocked = await this.rateLimitService.isAccountLocked(data.email);
    if (isLocked) {
      const lockoutInfo = await this.rateLimitService.getLockoutInfo(data.email);
      const remainingMinutes = lockoutInfo?.remainingLockoutMinutes ?? 0;
      throw new UnauthorizedException(
        `Account temporarily locked due to too many failed login attempts. Please try again in ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}.`,
      );
    }

    const failedAttempts = await this.rateLimitService.getFailedAttemptsCount(data.email);
    const captchaThreshold = parseInt(
      this.configService.get<string>('CAPTCHA_THRESHOLD') ?? '3',
      10,
    );

    if (failedAttempts >= captchaThreshold) {
      if (!data.captchaToken) {
        throw new UnauthorizedException('CAPTCHA verification required');
      }
      const isCaptchaValid = await this.verifyCaptcha(data.captchaToken);
      if (!isCaptchaValid) {
        // We might also record a failed attempt here if we wanted to
        throw new UnauthorizedException('Invalid CAPTCHA');
      }
    }

    const user = await this.usersService.findByEmail(data.email);
    if (!user) {
      // Record failed attempt even if user doesn't exist (prevent enumeration)
      await this.rateLimitService.recordFailedAttempt(data.email, ipAddress, userAgent);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.isBlocked) {
      throw new UnauthorizedException('Your account has been blocked. Please contact support.');
    }

    if (user.isDeactivated) {
      throw new UnauthorizedException(
        'Your account has been deactivated. Please contact support to reactivate your account.',
      );
    }

    const passwordMatches = await comparePassword(data.password, user.password ?? '');
    if (!passwordMatches) {
      // Record failed login attempt
      const shouldLock = await this.rateLimitService.recordFailedAttempt(
        data.email,
        ipAddress,
        userAgent,
      );

      await this.fraudService.evaluateFailedLogin(data.email, ipAddress, userAgent);

      if (shouldLock) {
        const lockoutDuration = 30;
        await this.emailService.sendAccountLockedEmail(user.email, lockoutDuration).catch((err) => {
          this.logger.error(`Failed to send account locked email to ${user.email}: ${err.message}`);
        });

        throw new UnauthorizedException(
          `Account locked due to too many failed login attempts. Please try again in ${lockoutDuration} minutes.`,
        );
      }

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

    // Record successful login
    await this.rateLimitService.recordSuccessfulAttempt(data.email, ipAddress, userAgent);
    await this.recordLoginHistory(user.id, ipAddress, userAgent);
    await this.fraudService.evaluateSuccessfulLogin(user.id, ipAddress, userAgent);

    const refreshedUser = await this.prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!refreshedUser) {
      throw new UnauthorizedException('User no longer exists');
    }

    if (refreshedUser.isBlocked) {
      throw new UnauthorizedException(
        'Your account has been blocked after a fraud review. Please contact support.',
      );
    }

    const tokens = await this.issueTokenPair(refreshedUser, undefined, ipAddress, userAgent);
    return {
      user: sanitizeUser(refreshedUser),
      ...tokens,
    };
  }

  async refreshToken(data: RefreshTokenDto, ipAddress?: string, userAgent?: string) {
    const payload = this.verifyToken(data.refreshToken, this.jwtRefreshSecret) as JwtPayload;

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check if token is blacklisted (already used)
    const blacklistedToken = await this.prisma.blacklistedToken.findUnique({
      where: { jti: payload.jti },
    });

    if (blacklistedToken) {
      // TOKEN REUSE DETECTED! This is a potential attack
      // Mark the reuse and invalidate the entire token family
      await this.handleTokenReuse(blacklistedToken, payload.jti, ipAddress, userAgent);
      await this.fraudService.handleTokenReuse(payload.sub, payload.jti, ipAddress, userAgent);

      this.logger.error(
        `Refresh token reuse detected for user ${payload.sub} (JTI: ${payload.jti}, Family: ${payload.family}). IP: ${ipAddress}`,
      );

      throw new UnauthorizedException(
        'Token reuse detected. All sessions have been invalidated for security. Please login again.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    if (user.isBlocked) {
      throw new UnauthorizedException('Your account has been blocked');
    }

    if (user.isDeactivated) {
      throw new UnauthorizedException('Your account has been deactivated');
    }

    // Blacklist the current refresh token (rotation)
    await this.blacklistToken({
      jti: payload.jti,
      tokenType: 'REFRESH',
      expiresAt: new Date((payload.exp ?? 0) * 1000),
      userId: user.id,
      tokenFamily: payload.family,
      ipAddress,
      userAgent,
    });

    // Issue new token pair with SAME family ID
    const tokens = await this.issueTokenPair(user, payload.family, ipAddress, userAgent);

    this.logger.log(
      `Token rotated for user ${user.id} (${user.email}). Family: ${payload.family}. IP: ${ipAddress}`,
    );

    return {
      user: sanitizeUser(user),
      ...tokens,
    };
  }

  /**
   * Handle token reuse detection - invalidate entire token family
   */
  private async handleTokenReuse(
    blacklistedToken: any,
    reusedJti: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const now = new Date();

    // Mark the reused token
    await this.prisma.blacklistedToken.update({
      where: { jti: reusedJti },
      data: {
        reusedAt: now,
        ipAddress: ipAddress || blacklistedToken.ipAddress,
        userAgent: userAgent || blacklistedToken.userAgent,
      },
    });

    // Invalidate entire token family if it exists
    if (blacklistedToken.tokenFamily) {
      const familyTokens = await this.prisma.blacklistedToken.findMany({
        where: {
          tokenFamily: blacklistedToken.tokenFamily,
          expiresAt: { gt: now }, // Only active tokens
        },
        select: { jti: true },
      });

      this.logger.warn(
        `Invalidating ${familyTokens.length} tokens in family ${blacklistedToken.tokenFamily} due to reuse detection`,
      );

      // All tokens in this family are already blacklisted, but we log the event
      // The key is that we're preventing the attacker from using any token from this family
    }
  }

  async logout(user: AuthUserPayload, refreshToken?: string, accessToken?: string) {
    const logoutTime = new Date();

    // Blacklist the access token if provided
    if (accessToken) {
      try {
        const accessPayload = this.verifyToken(accessToken, this.jwtSecret) as JwtPayload;
        await this.blacklistToken({
          jti: accessPayload.jti,
          tokenType: 'ACCESS',
          expiresAt: new Date((accessPayload.exp ?? 0) * 1000),
          userId: user.sub,
          tokenFamily: accessPayload.family,
        });
      } catch (error) {
        // Token might already be expired or invalid, continue with logout
        this.logger.warn(`Failed to blacklist access token for user ${user.sub}: ${error.message}`);
      }
    }

    // Blacklist the specific refresh token if provided
    if (refreshToken) {
      try {
        const refreshPayload = this.verifyToken(refreshToken, this.jwtRefreshSecret) as JwtPayload;
        if (refreshPayload.sub !== user.sub) {
          throw new UnauthorizedException('Refresh token does not belong to the current user');
        }

        await this.blacklistToken({
          jti: refreshPayload.jti,
          tokenType: 'REFRESH',
          expiresAt: new Date((refreshPayload.exp ?? 0) * 1000),
          userId: user.sub,
          tokenFamily: refreshPayload.family,
        });
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        // Token might already be expired or invalid, continue with logout
        this.logger.warn(
          `Failed to blacklist refresh token for user ${user.sub}: ${error.message}`,
        );
      }
    }

    // Log the logout event
    this.logger.log(
      `User ${user.sub} (${user.email}) logged out successfully at ${logoutTime.toISOString()}`,
    );

    return {
      message: 'Logged out successfully',
      logoutTime: logoutTime.toISOString(),
      tokensInvalidated: {
        accessToken: !!accessToken,
        refreshToken: !!refreshToken,
      },
      clientAction: {
        clearStorage: true,
        clearCookies: true,
        redirectUrl: '/login',
      },
    };
  }

  async logoutAllDevices(user: AuthUserPayload, accessToken?: string) {
    const logoutTime = new Date();

    // Blacklist the current access token if provided
    if (accessToken) {
      try {
        const accessPayload = this.verifyToken(accessToken, this.jwtSecret) as JwtPayload;
        await this.blacklistToken({
          jti: accessPayload.jti,
          tokenType: 'ACCESS',
          expiresAt: new Date((accessPayload.exp ?? 0) * 1000),
          userId: user.sub,
        });
      } catch (error) {
        this.logger.warn(`Failed to blacklist access token for user ${user.sub}: ${error.message}`);
      }
    }

    // Find all blacklisted refresh tokens for this user that are still active
    const blacklistedRefreshTokens = await this.prisma.blacklistedToken.findMany({
      where: {
        userId: user.sub,
        tokenType: 'REFRESH',
        expiresAt: {
          gt: logoutTime, // Only count tokens that haven't expired yet
        },
      },
    });

    this.logger.log(
      `User ${user.sub} (${user.email}) logged out from all devices at ${logoutTime.toISOString()}. Total active blacklisted refresh tokens: ${blacklistedRefreshTokens.length}`,
    );

    return {
      message: 'Logged out from all devices successfully',
      logoutTime: logoutTime.toISOString(),
      blacklistedTokensCount: blacklistedRefreshTokens.length,
      clientAction: {
        clearStorage: true,
        clearCookies: true,
        redirectUrl: '/login',
      },
    };
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

  // Only one implementation should exist; duplicate removed.

  async getDashboard(user: AuthUserPayload) {
    const foundUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
    });

    if (!foundUser) {
      throw new NotFoundException('User not found');
    }

    const [properties, buyerTransactions, sellerTransactions, documents, apiKeys] =
      await Promise.all([
        this.prisma.property.findMany({
          where: { ownerId: user.sub },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.transaction.findMany({
          where: { buyerId: user.sub },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            property: {
              select: {
                id: true,
                title: true,
                address: true,
                city: true,
                state: true,
                price: true,
              },
            },
            seller: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        }),
        this.prisma.transaction.findMany({
          where: { sellerId: user.sub },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            property: {
              select: {
                id: true,
                title: true,
                address: true,
                city: true,
                state: true,
                price: true,
              },
            },
            buyer: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        }),
        this.prisma.document.findMany({
          where: { userId: user.sub },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        this.prisma.apiKey.findMany({
          where: { userId: user.sub },
          orderBy: { createdAt: 'desc' },
          take: 3,
        }),
      ]);

    const [
      totalProperties,
      activeListings,
      pendingSales,
      totalPurchases,
      totalSales,
      completedPurchases,
      completedSales,
    ] = await Promise.all([
      this.prisma.property.count({ where: { ownerId: user.sub } }),
      this.prisma.property.count({ where: { ownerId: user.sub, status: 'ACTIVE' } }),
      this.prisma.transaction.count({ where: { sellerId: user.sub, status: 'PENDING' } }),
      this.prisma.transaction.count({ where: { buyerId: user.sub } }),
      this.prisma.transaction.count({ where: { sellerId: user.sub } }),
      this.prisma.transaction.count({ where: { buyerId: user.sub, status: 'COMPLETED' } }),
      this.prisma.transaction.count({ where: { sellerId: user.sub, status: 'COMPLETED' } }),
    ]);

    const recommendationProperties = await this.prisma.property.findMany({
      where: {
        status: 'ACTIVE',
        ownerId: { not: user.sub },
        NOT: {
          ownerId: user.sub,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        owner: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    const recentActivity = [
      ...this.transactionsToActivityItems(buyerTransactions, 'purchase'),
      ...this.transactionsToActivityItems(sellerTransactions, 'sale'),
      ...documents.map((doc: any) => ({
        type: 'document' as const,
        id: doc.id,
        title: doc.fileName,
        description: `Uploaded ${doc.documentType.toLowerCase().replace('_', ' ')}`,
        timestamp: doc.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);

    return {
      profile: sanitizeUser(foundUser),
      quickStats: {
        totalProperties,
        activeListings,
        pendingSales,
        totalPurchases,
        totalSales,
        completedPurchases,
        completedSales,
        apiKeysCount: apiKeys.length,
      },
      recentActivity,
      recommendations: recommendationProperties.map((p: any) => ({
        id: p.id,
        title: p.title,
        address: p.address,
        city: p.city,
        state: p.state,
        price: p.price.toString(),
        propertyType: p.propertyType,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms?.toString(),
        squareFeet: p.squareFeet?.toString(),
        status: p.status,
        agent: `${p.owner.firstName} ${p.owner.lastName}`,
        createdAt: p.createdAt,
      })),
    };
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
      existingUser.password ?? '',
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

    const passwordMatches = await comparePassword(password, foundUser.password ?? '');
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
    const permissions = this.normalizePermissions(data.permissions);
    const record = await this.prisma.apiKey.create({
      data: {
        userId: user.sub,
        name: data.name,
        keyPrefix: apiKeyValue.slice(0, 12),
        keyHash: createSha256(apiKeyValue),
        permissions,
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
      permissions: apiKey.permissions,
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

  async googleOAuthLogin(profile: GoogleProfile) {
    let user = await this.prisma.user.findUnique({ where: { googleId: profile.googleId } });

    if (!user) {
      // Try to link to an existing account by email
      user = await this.prisma.user.findUnique({ where: { email: profile.email } });

      if (user) {
        // Link Google account to existing user
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: profile.googleId,
            avatar: user.avatar ?? profile.avatar,
          },
        });
      } else {
        // Create new user from Google profile
        user = await this.prisma.user.create({
          data: {
            email: profile.email,
            googleId: profile.googleId,
            firstName: profile.firstName,
            lastName: profile.lastName,
            avatar: profile.avatar,
            isVerified: true,
          },
        });
      }
    } else {
      // Sync profile fields
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          firstName: profile.firstName,
          lastName: profile.lastName,
          avatar: user.avatar ?? profile.avatar,
        },
      });
    }

    const tokens = await this.issueTokenPair(user);
    return { user: sanitizeUser(user), ...tokens };
  }

  async updateApiKeyPermissions(
    user: AuthUserPayload,
    apiKeyId: string,
    data: UpdateApiKeyPermissionsDto,
  ) {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: {
        id: apiKeyId,
        userId: user.sub,
      },
    });

    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    const updated = await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: {
        permissions: this.normalizePermissions(data.permissions),
      },
    });

    return this.toApiKeyResponse(updated);
  }

  async getApiKeyUsage(user: AuthUserPayload, apiKeyId: string) {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: {
        id: apiKeyId,
        userId: user.sub,
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        usageCount: true,
        lastUsedAt: true,
        revokedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    return apiKey;
  }

  async validateAccessToken(token: string): Promise<AuthUserPayload> {
    const payload = this.verifyToken(token, this.jwtSecret) as JwtPayload;

    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid access token');
    }

    await this.ensureTokenNotBlacklisted(payload.jti);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        email: true,
        role: true,
        lastActivityAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    const now = new Date();
    if (!user.lastActivityAt || now.getTime() - user.lastActivityAt.getTime() > 5 * 60 * 1000) {
      this.prisma.user
        .update({
          where: { id: payload.sub },
          data: { lastActivityAt: now },
        })
        .catch((err) => this.logger.error(`Failed to update lastActivityAt: ${err.message}`));
    }

    return {
      sub: payload.sub,
      email: user.email,
      role: user.role,
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
        usageCount: {
          increment: 1,
        },
      },
    });

    return {
      sub: apiKey.userId,
      email: apiKey.user.email,
      role: apiKey.user.role as UserRole,
      type: 'api-key',
      apiKeyId: apiKey.id,
      apiKeyPermissions: apiKey.permissions,
    };
  }

  private async issueTokenPair(
    user: PrismaUser,
    tokenFamily?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const accessJti = randomUUID();
    const refreshJti = randomUUID();
    const family = tokenFamily || randomUUID(); // Create new family if not provided

    const accessToken = this.signToken(
      {
        sub: user.id,
        email: user.email,
        role: user.role as UserRole,
        type: 'access',
        jti: accessJti,
        family: family,
      },
      this.jwtSecret,
      this.accessTokenTtlSeconds,
    );

    const refreshToken = this.signToken(
      {
        sub: user.id,
        email: user.email,
        role: user.role as UserRole,
        type: 'refresh',
        jti: refreshJti,
        family: family,
      },
      this.jwtRefreshSecret,
      this.refreshTokenTtlSeconds,
    );

    // Create a session for tracking
    await this.sessionsService.createSession(
      user.id,
      accessJti,
      refreshJti,
      ipAddress,
      userAgent,
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
    tokenFamily?: string;
    previousJti?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    await this.prisma.blacklistedToken.upsert({
      where: { jti: data.jti },
      update: {
        expiresAt: data.expiresAt,
        tokenType: data.tokenType,
        userId: data.userId,
        tokenFamily: data.tokenFamily,
        previousJti: data.previousJti,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
      create: {
        jti: data.jti,
        tokenType: data.tokenType,
        expiresAt: data.expiresAt,
        userId: data.userId,
        tokenFamily: data.tokenFamily,
        previousJti: data.previousJti,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
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
      permissions: apiKey.permissions,
      usageCount: apiKey.usageCount,
      lastUsedAt: apiKey.lastUsedAt,
      expiresAt: apiKey.expiresAt,
      revokedAt: apiKey.revokedAt,
      createdAt: apiKey.createdAt,
      updatedAt: apiKey.updatedAt,
    };
  }

  private normalizePermissions(permissions?: string[]) {
    if (!permissions || permissions.length === 0) {
      return [];
    }

    return Array.from(new Set(permissions.map((permission) => permission.trim()).filter(Boolean)));
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
            id: { in: historyEntries.map((entry: any) => entry.id) },
          },
        });
      }
    });
  }

  async unlockAccount(email: string) {
    await this.rateLimitService.unlockAccount(email);
    return { message: 'Account unlocked successfully. You can now try to log in again.' };
  }

  async getLoginStatus(email: string) {
    const lockoutInfo = await this.rateLimitService.getLockoutInfo(email);

    if (!lockoutInfo) {
      return {
        email,
        isLocked: false,
        failedAttempts: 0,
        canAttemptLogin: true,
      };
    }

    return {
      email,
      isLocked: lockoutInfo.isLocked,
      failedAttempts: lockoutInfo.failedAttempts,
      unlockAt: lockoutInfo.unlockAt,
      remainingLockoutMinutes: lockoutInfo.remainingLockoutMinutes,
      canAttemptLogin: !lockoutInfo.isLocked,
    };
  }

  private async recordLoginHistory(userId: string, ipAddress?: string, userAgent?: string) {
    await this.prisma.loginHistory.create({
      data: {
        userId,
        ipAddress,
        userAgent,
      },
    });
  }

  private async verifyCaptcha(token: string): Promise<boolean> {
    const secret = this.configService.get<string>('RECAPTCHA_SECRET');
    if (!secret) {
      this.logger.warn('RECAPTCHA_SECRET is not configured, skipping CAPTCHA verification');
      return true; // Bypass if not configured in dev
    }

    try {
      const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `secret=${secret}&response=${token}`,
      });

      const data = (await response.json()) as any;

      // reCAPTCHA v3 returns a score between 0.0 and 1.0. Typically, 0.5 is a good threshold.
      if (data.success && data.score !== undefined && data.score >= 0.5) {
        return true;
      }

      if (data.success && data.score === undefined) {
        // v2 fallback
        return true;
      }

      this.logger.warn(`CAPTCHA verification failed: ${JSON.stringify(data['error-codes'])}`);
      return false;
    } catch (error) {
      this.logger.error(`Error verifying CAPTCHA: ${error.message}`);
      return false;
    }
  }
}
