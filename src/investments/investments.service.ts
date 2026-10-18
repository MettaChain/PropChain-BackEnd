import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { retryWithBackoff } from './retry.util';

@Injectable()
export class InvestmentsService {
  constructor(private readonly prisma: PrismaService) {}

  // Issue #1406 – DB reads are retried with exponential backoff.
  async getMetrics(propertyId: string) {
    const metrics = await retryWithBackoff(() =>
      this.prisma.property.findUnique({
        where: { id: propertyId },
        select: { id: true, capRate: true, roi: true, rentalYield: true, cashFlow: true },
      }),
    );
    if (!metrics) {
      throw new NotFoundException('Property not found');
    }
    return metrics;
  }

  // Issue #1407 – Health check for InvestmentAPI.
  async health() {
    try {
      await retryWithBackoff(() => this.prisma.$queryRaw`SELECT 1`, 1);
      return { status: 'ok', service: 'InvestmentAPI', timestamp: new Date().toISOString() };
    } catch {
      return { status: 'error', service: 'InvestmentAPI', timestamp: new Date().toISOString() };
    }
  }
}
