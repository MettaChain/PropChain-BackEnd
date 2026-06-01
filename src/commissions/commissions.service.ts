import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { CommissionListQueryDto } from './dto/commission.dto';
import { AuthUserPayload } from '../auth/types/auth-user.type';

@Injectable()
export class CommissionsService {
  private readonly logger = new Logger(CommissionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Automatically calculate and create commission records for a transaction
   */
  async createCommissionsForTransaction(transactionId: string): Promise<void> {
    try {
      const transaction = await (this.prisma.transaction as any).findUnique({
        where: { id: transactionId },
        include: {
          property: {
            include: {
              agents: true,
            },
          },
        },
      });

      if (!transaction) {
        this.logger.error(`Transaction ${transactionId} not found when generating commissions`);
        return;
      }

      const agents = (transaction as any).property?.agents || [];
      this.logger.log(
        `Found ${agents.length} agents assigned to property for transaction ${transactionId}`,
      );

      for (const agentAssignment of agents) {
        // Calculate commission amount
        const amount = transaction.amount.mul(agentAssignment.commissionRate);

        // Check if commission record already exists
        const existing = await (this.prisma as any).commission.findUnique({
          where: {
            transactionId_agentId: {
              transactionId,
              agentId: agentAssignment.agentId,
            },
          },
        });

        if (existing) {
          this.logger.warn(
            `Commission for transaction ${transactionId} and agent ${agentAssignment.agentId} already exists`,
          );
          continue;
        }

        await (this.prisma as any).commission.create({
          data: {
            transactionId,
            agentId: agentAssignment.agentId,
            propertyId: transaction.propertyId,
            amount,
            rate: agentAssignment.commissionRate,
            status: transaction.status,
          },
        });

        this.logger.log(
          `Created commission of ${amount.toString()} for agent ${agentAssignment.agentId} on transaction ${transactionId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to create commissions for transaction ${transactionId}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Synchronize commission status with transaction status
   */
  async updateCommissionsStatus(transactionId: string, status: string): Promise<void> {
    try {
      const dbStatus =
        status === 'COMPLETED' ? 'COMPLETED' : status === 'CANCELLED' ? 'CANCELLED' : 'PENDING';

      const result = await (this.prisma as any).commission.updateMany({
        where: { transactionId },
        data: { status: dbStatus as any },
      });

      this.logger.log(
        `Updated ${result.count} commission statuses to ${dbStatus} for transaction ${transactionId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update commission statuses for transaction ${transactionId}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Find commissions with pagination and filtering
   */
  async findAll(query: CommissionListQueryDto, user: AuthUserPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    // Access control: agents can only see their own commissions
    if (user.role === 'AGENT') {
      where.agentId = user.sub;
    } else if (query.agentId) {
      where.agentId = query.agentId;
    }

    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }

    if (query.transactionId) {
      where.transactionId = query.transactionId;
    }

    if (query.status) {
      where.status = query.status;
    }

    const [items, total] = await Promise.all([
      (this.prisma as any).commission.findMany({
        where,
        skip,
        take: limit,
        include: {
          agent: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          property: {
            select: {
              id: true,
              title: true,
              address: true,
            },
          },
          transaction: {
            select: {
              id: true,
              amount: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      (this.prisma as any).commission.count({ where }),
    ]);

    return {
      total,
      page,
      limit,
      items: items.map((item: any) => ({
        ...item,
        amount: Number(item.amount),
        rate: Number(item.rate),
        transaction: {
          ...item.transaction,
          amount: Number(item.transaction.amount),
        },
      })),
    };
  }

  /**
   * Find details of a single commission record
   */
  async findOne(id: string, user: AuthUserPayload) {
    const commission = await (this.prisma as any).commission.findUnique({
      where: { id },
      include: {
        agent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        property: {
          select: {
            id: true,
            title: true,
            address: true,
            price: true,
          },
        },
        transaction: {
          select: {
            id: true,
            amount: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!commission) {
      throw new NotFoundException('Commission record not found');
    }

    // Access control: Admins can see all, Agents only their own
    if (user.role !== 'ADMIN' && commission.agentId !== user.sub) {
      throw new ForbiddenException('You are not authorized to view this commission record');
    }

    return {
      ...commission,
      amount: Number(commission.amount),
      rate: Number(commission.rate),
      property: {
        ...commission.property,
        price: Number(commission.property.price),
      },
      transaction: {
        ...commission.transaction,
        amount: Number(commission.transaction.amount),
      },
    };
  }

  /**
   * Get commission stats for the current user (Agent or Admin)
   */
  async getStats(user: AuthUserPayload) {
    if (user.role === 'ADMIN') {
      // Global Statistics
      const completedAgg = await (this.prisma as any).commission.aggregate({
        _sum: { amount: true },
        where: { status: 'COMPLETED' },
      });

      const pendingAgg = await (this.prisma as any).commission.aggregate({
        _sum: { amount: true },
        where: { status: 'PENDING' },
      });

      const cancelledAgg = await (this.prisma as any).commission.aggregate({
        _sum: { amount: true },
        where: { status: 'CANCELLED' },
      });

      // Get count of completed vs pending
      const completedCount = await (this.prisma as any).commission.count({
        where: { status: 'COMPLETED' },
      });
      const pendingCount = await (this.prisma as any).commission.count({
        where: { status: 'PENDING' },
      });

      // Breakdown per agent
      const commissions = await (this.prisma as any).commission.findMany({
        include: {
          agent: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      const agentMap = new Map<
        string,
        { name: string; email: string; earned: number; pending: number }
      >();
      commissions.forEach((c: any) => {
        const agentId = c.agentId;
        const current = agentMap.get(agentId) || {
          name: `${c.agent.firstName} ${c.agent.lastName}`,
          email: c.agent.email,
          earned: 0,
          pending: 0,
        };

        if (c.status === 'COMPLETED') {
          current.earned += Number(c.amount);
        } else if (c.status === 'PENDING') {
          current.pending += Number(c.amount);
        }

        agentMap.set(agentId, current);
      });

      const agentStats = Array.from(agentMap.entries()).map(([agentId, data]) => ({
        agentId,
        ...data,
      }));

      return {
        totalEarned: Number(completedAgg._sum.amount || 0),
        totalPending: Number(pendingAgg._sum.amount || 0),
        totalCancelled: Number(cancelledAgg._sum.amount || 0),
        completedCount,
        pendingCount,
        agentStats,
      };
    } else {
      // Agent-specific Statistics
      const completedAgg = await (this.prisma as any).commission.aggregate({
        _sum: { amount: true },
        where: { agentId: user.sub, status: 'COMPLETED' },
      });

      const pendingAgg = await (this.prisma as any).commission.aggregate({
        _sum: { amount: true },
        where: { agentId: user.sub, status: 'PENDING' },
      });

      const completedCount = await (this.prisma as any).commission.count({
        where: { agentId: user.sub, status: 'COMPLETED' },
      });

      const pendingCount = await (this.prisma as any).commission.count({
        where: { agentId: user.sub, status: 'PENDING' },
      });

      return {
        earned: Number(completedAgg._sum.amount || 0),
        pending: Number(pendingAgg._sum.amount || 0),
        completedCount,
        pendingCount,
      };
    }
  }
}
