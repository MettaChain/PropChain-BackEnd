import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface LoginAttemptConfig {
  maxAttempts: number;
  lockoutDurationMinutes: number;
}

@Injectable()
export class LoginRateLimitService {
  private readonly logger = new Logger(LoginRateLimitService.name);
  private readonly config: LoginAttemptConfig;

  constructor(private readonly prisma: PrismaService) {
    this.config = {
      maxAttempts: 5,
      lockoutDurationMinutes: 30,
    };
  }

  /**
   * Check if an account is currently locked out
   */
  async isAccountLocked(email: string): Promise<boolean> {
    const lockedAttempt = await this.prisma.loginAttempt.findFirst({
      where: {
        email: email.toLowerCase(),
        lockedOut: true,
        unlockAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        attemptTime: 'desc',
      },
    });

    return lockedAttempt !== null;
  }

  /**
   * Record a failed login attempt
   * Returns true if account should be locked
   */
  async recordFailedAttempt(
    email: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<boolean> {
    const normalizedEmail = email.toLowerCase();

    // Count recent failed attempts within lockout window
    const lockoutWindowStart = new Date(
      Date.now() - this.config.lockoutDurationMinutes * 60 * 1000,
    );

    const recentFailures = await this.prisma.loginAttempt.count({
      where: {
        email: normalizedEmail,
        success: false,
        attemptTime: {
          gte: lockoutWindowStart,
        },
      },
    });

    const shouldLock = recentFailures + 1 >= this.config.maxAttempts;
    const unlockAt = shouldLock
      ? new Date(Date.now() + this.config.lockoutDurationMinutes * 60 * 1000)
      : null;

    // Record this attempt
    await this.prisma.loginAttempt.create({
      data: {
        email: normalizedEmail,
        ipAddress,
        userAgent,
        success: false,
        lockedOut: shouldLock,
        unlockAt,
      },
    });

    if (shouldLock) {
      this.logger.warn(
        `Account locked due to too many failed login attempts: ${email} (IP: ${ipAddress || 'unknown'})`,
      );
    }

    return shouldLock;
  }

  /**
   * Record a successful login attempt
   */
  async recordSuccessfulAttempt(
    email: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.prisma.loginAttempt.create({
      data: {
        email: email.toLowerCase(),
        ipAddress,
        userAgent,
        success: true,
        lockedOut: false,
      },
    });

    this.logger.log(`Successful login: ${email} (IP: ${ipAddress || 'unknown'})`);
  }

  /**
   * Get the number of failed attempts in the current window
   */
  async getFailedAttemptsCount(email: string): Promise<number> {
    const lockoutWindowStart = new Date(
      Date.now() - this.config.lockoutDurationMinutes * 60 * 1000,
    );

    return this.prisma.loginAttempt.count({
      where: {
        email: email.toLowerCase(),
        success: false,
        attemptTime: {
          gte: lockoutWindowStart,
        },
      },
    });
  }

  /**
   * Manually unlock an account (for admin or user request)
   */
  async unlockAccount(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase();

    // Mark all locked attempts as unlocked
    await this.prisma.loginAttempt.updateMany({
      where: {
        email: normalizedEmail,
        lockedOut: true,
        unlockAt: {
          gt: new Date(),
        },
      },
      data: {
        lockedOut: false,
        unlockAt: null,
      },
    });

    this.logger.log(`Account manually unlocked: ${email}`);
  }

  /**
   * Get lockout information for an account
   */
  async getLockoutInfo(email: string): Promise<{
    isLocked: boolean;
    failedAttempts: number;
    unlockAt?: Date;
    remainingLockoutMinutes?: number;
  } | null> {
    const normalizedEmail = email.toLowerCase();

    const failedAttempts = await this.getFailedAttemptsCount(normalizedEmail);
    const isLocked = await this.isAccountLocked(normalizedEmail);

    if (!isLocked && failedAttempts === 0) {
      return null;
    }

    let unlockAt: Date | undefined;
    let remainingLockoutMinutes: number | undefined;

    if (isLocked) {
      const lockedAttempt = await this.prisma.loginAttempt.findFirst({
        where: {
          email: normalizedEmail,
          lockedOut: true,
          unlockAt: {
            gt: new Date(),
          },
        },
        orderBy: {
          attemptTime: 'desc',
        },
        select: {
          unlockAt: true,
        },
      });

      if (lockedAttempt?.unlockAt) {
        unlockAt = lockedAttempt.unlockAt;
        if (unlockAt) {
          remainingLockoutMinutes = Math.ceil((unlockAt.getTime() - Date.now()) / (1000 * 60));
        }
      }
    }

    return {
      isLocked,
      failedAttempts,
      unlockAt,
      remainingLockoutMinutes,
    };
  }

  /**
   * Clean up old login attempts (for maintenance)
   */
  async cleanupOldAttempts(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.prisma.loginAttempt.deleteMany({
      where: {
        attemptTime: {
          lt: cutoffDate,
        },
      },
    });

    this.logger.log(`Cleaned up ${result.count} old login attempts`);
    return result.count;
  }
}
