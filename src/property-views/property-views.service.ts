import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface RecordViewInput {
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  referrer?: string | null;
  sessionId?: string | null;
}

const BOT_USER_AGENT_PATTERNS =
  /bot|crawler|spider|scraper|curl|wget|python-requests|headless|phantom|selenium|puppeteer/i;

const DEDUP_IP_WINDOW_MINUTES = 30;
const DEDUP_USER_WINDOW_HOURS = 24;

export interface ViewHistoryParams {
  skip?: number;
  take?: number;
  since?: Date;
}

export interface PopularQueryParams {
  take?: number;
  since?: Date;
}

@Injectable()
export class PropertyViewsService {
  private readonly logger = new Logger(PropertyViewsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Detect common bot user-agent patterns.
   */
  private isBotUserAgent(userAgent?: string | null): boolean {
    if (!userAgent) return false;
    return BOT_USER_AGENT_PATTERNS.test(userAgent);
  }

  /**
   * Check if a duplicate view was recorded recently from the same IP
   * within the deduplication window.
   */
  private async isDuplicateByIp(propertyId: string, ipAddress: string | null): Promise<boolean> {
    if (!ipAddress) return false;
    const cutoff = new Date(Date.now() - DEDUP_IP_WINDOW_MINUTES * 60 * 1000);
    const recent = await this.prisma.propertyView.findFirst({
      where: {
        propertyId,
        ipAddress,
        viewedAt: { gte: cutoff },
      },
      select: { id: true },
    });
    return !!recent;
  }

  /**
   * Check if a duplicate view was recorded recently by the same user
   * within the deduplication window.
   */
  private async isDuplicateByUser(propertyId: string, userId: string | null): Promise<boolean> {
    if (!userId) return false;
    const cutoff = new Date(Date.now() - DEDUP_USER_WINDOW_HOURS * 60 * 60 * 1000);
    const recent = await this.prisma.propertyView.findFirst({
      where: {
        propertyId,
        userId,
        viewedAt: { gte: cutoff },
      },
      select: { id: true },
    });
    return !!recent;
  }

  /**
   * Record a view event and atomically increment the property's view counter.
   * Applies deduplication: bot requests, repeat IP (30 min), repeat user (24 hr).
   */
  async recordView(propertyId: string, input: RecordViewInput) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });

    if (!property) {
      throw new NotFoundException(`Property ${propertyId} not found`);
    }

    // Dedup: filter bot traffic
    if (this.isBotUserAgent(input.userAgent)) {
      this.logger.debug(`View suppressed: bot user-agent detected for property ${propertyId}`);
      return { view: null, deduplicated: true, reason: 'bot' };
    }

    // Dedup: same IP within 30 minutes
    if (await this.isDuplicateByIp(propertyId, input.ipAddress ?? null)) {
      this.logger.debug(`View suppressed: duplicate IP for property ${propertyId}`);
      return { view: null, deduplicated: true, reason: 'duplicate_ip' };
    }

    // Dedup: same user within 24 hours
    if (await this.isDuplicateByUser(propertyId, input.userId ?? null)) {
      this.logger.debug(`View suppressed: duplicate user for property ${propertyId}`);
      return { view: null, deduplicated: true, reason: 'duplicate_user' };
    }

    const [view, updated] = await this.prisma.$transaction([
      this.prisma.propertyView.create({
        data: {
          propertyId,
          userId: input.userId ?? null,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          referrer: input.referrer ?? null,
          sessionId: input.sessionId ?? null,
        },
      }),
      this.prisma.property.update({
        where: { id: propertyId },
        data: { viewCount: { increment: 1 } },
        select: { id: true, viewCount: true },
      }),
    ]);

    return { view, viewCount: updated.viewCount, deduplicated: false };
  }

  /**
   * Total view count for a property (denormalized counter).
   */
  async getViewCount(propertyId: string): Promise<number> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { viewCount: true },
    });
    if (!property) {
      throw new NotFoundException(`Property ${propertyId} not found`);
    }
    return property.viewCount;
  }

  /**
   * Unique visitor count = distinct authenticated users + distinct anonymous IPs.
   * Optionally bounded by a `since` timestamp.
   */
  async getUniqueVisitorCount(
    propertyId: string,
    since?: Date,
  ): Promise<{
    total: number;
    authenticatedUsers: number;
    anonymousIps: number;
  }> {
    const baseWhere = {
      propertyId,
      ...(since ? { viewedAt: { gte: since } } : {}),
    };

    const [authGroups, anonGroups] = await Promise.all([
      this.prisma.propertyView.groupBy({
        by: ['userId'],
        where: { ...baseWhere, userId: { not: null } },
      }),
      this.prisma.propertyView.groupBy({
        by: ['ipAddress'],
        where: { ...baseWhere, userId: null, ipAddress: { not: null } },
      }),
    ]);

    const authenticatedUsers = authGroups.length;
    const anonymousIps = anonGroups.length;

    return {
      total: authenticatedUsers + anonymousIps,
      authenticatedUsers,
      anonymousIps,
    };
  }

  /**
   * Paginated raw view history for a property.
   */
  async getViewHistory(propertyId: string, params: ViewHistoryParams = {}) {
    const skip = params.skip ?? 0;
    const take = params.take ?? 20;
    const where = {
      propertyId,
      ...(params.since ? { viewedAt: { gte: params.since } } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.propertyView.findMany({
        where,
        skip,
        take,
        orderBy: { viewedAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.propertyView.count({ where }),
    ]);

    return { items, total, skip, take };
  }

  /**
   * Most-viewed properties. When `since` is provided we aggregate raw events
   * within the window; otherwise we use the denormalized lifetime counter.
   */
  async getPopularProperties(params: PopularQueryParams = {}) {
    const take = params.take ?? 10;

    if (params.since) {
      const grouped = await this.prisma.propertyView.groupBy({
        by: ['propertyId'],
        where: { viewedAt: { gte: params.since } },
        _count: { propertyId: true },
        orderBy: { _count: { propertyId: 'desc' } },
        take,
      });

      const ids = grouped.map((g) => g.propertyId);
      if (ids.length === 0) {
        return [];
      }

      const properties = await this.prisma.property.findMany({
        where: { id: { in: ids } },
        include: {
          owner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      const byId = new Map(properties.map((p) => [p.id, p]));
      return grouped
        .map((g) => {
          const property = byId.get(g.propertyId);
          if (!property) return null;
          return { property, viewsInWindow: g._count.propertyId };
        })
        .filter(
          (entry): entry is { property: (typeof properties)[number]; viewsInWindow: number } =>
            entry !== null,
        );
    }

    const properties = await this.prisma.property.findMany({
      orderBy: { viewCount: 'desc' },
      take,
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return properties.map((property) => ({
      property,
      viewsInWindow: property.viewCount,
    }));
  }
}
