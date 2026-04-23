import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  SessionDto,
  SessionsListDto,
  RevokeSessionDto,
  RevokeAllSessionsDto,
} from './dto/session.dto';

@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new session
   */
  async createSession(
    userId: string,
    accessTokenJti: string,
    refreshTokenJti: string,
    ipAddress?: string,
    userAgent?: string,
    expiresInSeconds: number = 7 * 24 * 60 * 60, // 7 days
  ): Promise<SessionDto> {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    const session = await this.prisma.session.create({
      data: {
        userId,
        accessTokenJti,
        refreshTokenJti,
        ipAddress,
        userAgent,
        expiresAt,
      },
    });

    return this.mapSessionToDto(session);
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId: string): Promise<SessionsListDto> {
    const sessions = await this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const activeSessions = sessions.filter((s: any) => !s.isRevoked && s.expiresAt > new Date());
    const revokedSessions = sessions.filter((s: any) => s.isRevoked);

    return {
      sessions: sessions.map((s: any) => this.mapSessionToDto(s)),
      activeCount: activeSessions.length,
      revokedCount: revokedSessions.length,
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

    const updateResult = await this.prisma.session.updateMany({
      where,
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

    // Session is valid if it's not revoked and hasn't expired
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
   * Map Prisma session to DTO
   */
  private mapSessionToDto(session: any): SessionDto {
    return {
      id: session.id,
      accessTokenJti: session.accessTokenJti,
      refreshTokenJti: session.refreshTokenJti,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      isRevoked: session.isRevoked,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      revokedAt: session.revokedAt,
    };
  }
}
