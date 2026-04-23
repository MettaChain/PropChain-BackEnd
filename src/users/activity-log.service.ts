import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateActivityLogDto, GetActivityLogsDto } from './dto/activity-log.dto';

@Injectable()
export class ActivityLogService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, data: CreateActivityLogDto) {
    return this.prisma.activityLog.create({
      data: {
        userId,
        ...data,
      },
    });
  }

  async findByUserId(userId: string, filters?: GetActivityLogsDto) {
    const { action, entityType, startDate, endDate, sortOrder = 'desc' } = filters || {};

    const where: any = { userId };

    if (action) {
      where.action = action;
    }

    if (entityType) {
      where.entityType = entityType;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    return this.prisma.activityLog.findMany({
      where,
      orderBy: {
        createdAt: sortOrder,
      },
    });
  }

  async findAllForAdmin(page = 1, limit = 20, filters?: GetActivityLogsDto & { userId?: string }) {
    const skip = (page - 1) * limit;
    const { action, entityType, startDate, endDate, userId } = filters || {};

    const where: any = {};

    if (userId) {
      where.userId = userId;
    }

    if (action) {
      where.action = action;
    }

    if (entityType) {
      where.entityType = entityType;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    const [logs, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return {
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
