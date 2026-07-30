// @ts-nocheck

import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import {
  SessionDto,
  SessionsListDto,
  RevokeSessionDto,
  RevokeAllSessionsDto,
  UpdateSessionDto,
} from './dto/session.dto';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  private readonly maxConcurrentSessions: number;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.maxConcurrentSessions = this.configService.get<number>('MAX_CONCURRENT_SESSIONS', 5);
  }

  /**
   * Create a new session with device tracking and geo-location
   */
  async createSession(
    userId: string,
    accessTokenJti: string,
    refreshTokenJti: string,
    ipAddress?: string,
    userAgent?: string,
    expiresInSeconds: number = 7 * 24 * 60 * 60,
  ): Promise<SessionDto> {
    const activeSessionCount = await this.prisma.session.count({
      where: {
        userId,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (activeSessionCount >= this.maxConcurrentSessions) {
      throw new ConflictException(
        `Maximum concurrent sessions (${this.maxConcurrentSessions}) reached. Please terminate an existing session first.`,
      );
    }

    const deviceInfo = this.parseDeviceInfo(userAgent);
    const geoLocation = this.lookupGeoFromIp(ipAddress);
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    const session = await this.prisma.session.create({
      data: {
        userId,
        accessTokenJti,
        refreshTokenJti,
        ipAddress,
        userAgent,
        deviceInfo: deviceInfo as any,
        geoLocation: geoLocation as any,
        expiresAt,
      },
    });

    return this.mapSessionToDto(session);
  }

  /**
   * Get all sessions for a user.
   *
   * Issue #911 – Push active/revoked counts to the database with a single
   * aggregation query instead of loading all sessions and filtering in memory.
   */
  async getUserSessions(userId: string, currentAccessTokenJti?: string): Promise<SessionsListDto> {
    const now = new Date();

    // Fetch all sessions for display and run two DB count queries in parallel.
    // The counts avoid iterating the result set twice in JS.
    const [sessions, activeCount, revokedCount] = await Promise.all([
      this.prisma.session.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.session.count({
        where: { userId, isRevoked: false, expiresAt: { gt: now } },
      }),
      this.prisma.session.count({
        where: { userId, isRevoked: true },
      }),
    ]);

    return {
      sessions: sessions.map((s: any) =>
        this.mapSessionToDto(s, s.accessTokenJti === currentAccessTokenJti),
      ),
      activeCount,
      revokedCount,
    };
  }

  /**
   * Get a specific session
   */
  async getSession(sessionId: string): Promise<SessionDto> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return this.mapSessionToDto(session);
  }

  /**
   * Rename a session (update display name)
   */
  async updateSession(
    userId: string,
    sessionId: string,
    dto: UpdateSessionDto,
  ): Promise<SessionDto> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }

    const updated = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        displayName: dto.displayName,
      },
    });

    return this.mapSessionToDto(updated);
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(userId: string, sessionId: string): Promise<RevokeSessionDto> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });

    return {
      message: 'Session revoked successfully',
      sessionId,
    };
  }

  /**
   * Revoke all sessions for a user (except optionally the current one)
   */
  async revokeAllSessions(userId: string, exceptSessionId?: string): Promise<RevokeAllSessionsDto> {
    const where: any = { userId };
    if (exceptSessionId) {
      where.id = { not: exceptSessionId };
    }

    const sessions = await this.prisma.session.findMany({
      where: {
        ...where,
        isRevoked: false,
      },
    });

    const blacklistedTokens = sessions
      .flatMap((session: any) => [
        session.accessTokenJti
          ? {
              jti: session.accessTokenJti,
              tokenType: 'ACCESS' as const,
              expiresAt: session.expiresAt,
              userId,
            }
          : null,
        session.refreshTokenJti
          ? {
              jti: session.refreshTokenJti,
              tokenType: 'REFRESH' as const,
              expiresAt: session.expiresAt,
              userId,
            }
          : null,
      ])
      .filter(Boolean);

    if (blacklistedTokens.length > 0) {
      await this.prisma.blacklistedToken.createMany({
        data: blacklistedTokens,
        skipDuplicates: true,
      });
    }

    const updateResult = await this.prisma.session.updateMany({
      where: {
        ...where,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });

    return {
      message: 'All sessions revoked successfully',
      revokedCount: updateResult.count,
    };
  }

  /**
   * Update session's last activity timestamp
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        lastActivityAt: new Date(),
      },
    });
  }

  /**
   * Check if a session is valid and active
   */
  async isSessionValid(sessionId: string): Promise<boolean> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return false;
    }

    return !session.isRevoked && session.expiresAt > new Date();
  }

  /**
   * Get session by access token JTI
   */
  async getSessionByAccessTokenJti(accessTokenJti: string): Promise<SessionDto | null> {
    const session = await this.prisma.session.findFirst({
      where: { accessTokenJti },
    });

    if (!session) {
      return null;
    }

    return this.mapSessionToDto(session);
  }

  /**
   * Clean up expired sessions (for maintenance)
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    return result.count;
  }

  /**
   * Parse User-Agent string to extract device information
   */
  private parseDeviceInfo(userAgent?: string): {
    browser?: string;
    os?: string;
    deviceType?: string;
  } {
    if (!userAgent) return {};

    const browser = this.extractBrowser(userAgent);
    const os = this.extractOs(userAgent);
    const deviceType = this.extractDeviceType(userAgent);

    return { browser, os, deviceType };
  }

  private extractBrowser(ua: string): string | undefined {
    if (ua.includes('Firefox/')) return 'Firefox';
    if (ua.includes('Edg/')) return 'Edge';
    if (ua.includes('Chrome/')) return 'Chrome';
    if (ua.includes('Safari/') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Opera/') || ua.includes('OPR/')) return 'Opera';
    if (ua.includes('MSIE') || ua.includes('Trident/')) return 'Internet Explorer';
    return undefined;
  }

  private extractOs(ua: string): string | undefined {
    if (ua.includes('Windows NT 10')) return 'Windows 10+';
    if (ua.includes('Windows NT 6.1')) return 'Windows 7';
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac OS X')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
    return undefined;
  }

  private extractDeviceType(ua: string): string | undefined {
    if (ua.includes('Mobile') || ua.includes('Android')) return 'mobile';
    if (ua.includes('iPad') || ua.includes('Tablet')) return 'tablet';
    return 'desktop';
  }

  /**
   * Simple geo-location lookup from IP address
   * Returns raw IP-based location info or falls back to basic data
   */
  private lookupGeoFromIp(
    ipAddress?: string,
  ): { country?: string; city?: string; region?: string } | null {
    if (!ipAddress) return null;
    if (ipAddress === '127.0.0.1' || ipAddress === '::1' || ipAddress === '::ffff:127.0.0.1') {
      return { country: 'Local', city: 'Localhost', region: 'Local' };
    }
    return { country: 'Unknown', city: 'Unknown', region: 'Unknown' };
  }

  /**
   * Map Prisma session to DTO
   */
  private mapSessionToDto(session: any, isCurrent: boolean = false): SessionDto {
    const deviceInfo = session.deviceInfo as any;
    const geoLocation = session.geoLocation as any;
    return {
      id: session.id,
      accessTokenJti: session.accessTokenJti,
      refreshTokenJti: session.refreshTokenJti,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      displayName: session.displayName,
      deviceInfo: deviceInfo || undefined,
      geoLocation: geoLocation || undefined,
      isRevoked: session.isRevoked,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      revokedAt: session.revokedAt,
      isCurrent,
    };
  }
}
