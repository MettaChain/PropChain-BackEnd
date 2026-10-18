import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(page = 1, limit = 10) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 10));

    const [data, total] = await Promise.all([
      this.prisma.property.findMany({
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.property.count(),
    ]);

    return {
      data,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async checkHealth() {
    try {
      await this.prisma.property.count();
      return { status: 'ok', service: 'listings', timestamp: new Date().toISOString() };
    } catch {
      return { status: 'error', service: 'listings', timestamp: new Date().toISOString() };
    }
  }
}
