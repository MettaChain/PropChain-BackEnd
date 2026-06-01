import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface AuditContext {
  actorId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogFilter {
  actorId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class TransactionAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    transactionId: string,
    action: string,
    previousData: object | null,
    newData: object | null,
    ctx: AuditContext = {},
  ) {
    return this.prisma.transactionHistory.create({
      data: {
        transactionId,
        status: action as any,
        actorId: ctx.actorId,
        notes: JSON.stringify({ previousData, newData }),
        metadata: {
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        },
      },
    });
  }

  async findByTransaction(transactionId: string, filter: AuditLogFilter = {}) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { transactionId };
    if (filter.actorId) where.actorId = filter.actorId;
    if (filter.dateFrom || filter.dateTo) {
      where.createdAt = {};
      if (filter.dateFrom) where.createdAt.gte = new Date(filter.dateFrom);
      if (filter.dateTo) where.createdAt.lte = new Date(filter.dateTo);
    }

    const [entries, total] = await Promise.all([
      this.prisma.transactionHistory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          status: true,
          notes: true,
          metadata: true,
          createdAt: true,
          actor: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.transactionHistory.count({ where }),
    ]);

    return {
      entries,
      total,
      page,
      limit,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
    };
  }
}
