// @ts-nocheck

/**
 * PrismaService
 *
 * Wraps PrismaClient with lifecycle hooks and PgBouncer-compatible connection
 * configuration.  When the DATABASE_URL contains `?pgbouncer=true` or the
 * environment variable PGBOUNCER_ENABLED is set, the client is started in
 * PgBouncer mode which disables Prisma's built-in connection pooler and relies
 * on the external PgBouncer sidecar instead.
 *
 * Pool metrics are exported to Prometheus when MetricsModule is available.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const POOL_SIZE_DEFAULT = 10;
const POOL_TIMEOUT_MS = 10_000;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const isPgbouncerEnabled =
      process.env.PGBOUNCER_ENABLED === 'true' ||
      (process.env.DATABASE_URL || '').includes('pgbouncer=true');

    const poolSize = parseInt(process.env.PGBOUNCER_POOL_SIZE || String(POOL_SIZE_DEFAULT), 10);
    const poolTimeout = parseInt(
      process.env.PGBOUNCER_POOL_TIMEOUT || String(POOL_TIMEOUT_MS),
      10,
    );

    const logLevels: any[] =
      process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['error', 'warn', 'info'];

    super({
      log: logLevels.map((level) => ({ level, emit: 'event' })),
      ...(isPgbouncerEnabled
        ? {
            datasources: {
              db: {
                url: process.env.DATABASE_URL,
                connectionLimit: poolSize,
                poolTimeout,
              },
            },
          }
        : {}),
    });

    this.logger.log(
      `PrismaService initialised – PgBouncer: ${isPgbouncerEnabled}, pool size: ${poolSize}`,
    );
  }

  async onModuleInit() {
    await this.$connect();

    try {
      const { prismaPoolActive, prismaPoolIdle } = await import(
        '../metrics/metrics.controller'
      );
      setInterval(() => {
        const pool: any = (this as any)._engine?.connectionPool;
        if (pool) {
          prismaPoolActive.set(pool.active?.count?.() ?? 0);
          prismaPoolIdle.set(pool.idle?.count?.() ?? 0);
        }
      }, 10_000);
      this.logger.log('Prisma pool metrics exported to Prometheus');
    } catch {
      this.logger.debug('MetricsModule not available, skipping pool metric export');
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Return a snapshot of the current connection pool state.
   */
  getPoolMetrics(): { active: number; idle: number; poolSize: number } {
    const pool: any = (this as any)._engine?.connectionPool;
    return {
      active: pool?.active?.count?.() ?? 0,
      idle: pool?.idle?.count?.() ?? 0,
      poolSize: parseInt(process.env.PGBOUNCER_POOL_SIZE || String(POOL_SIZE_DEFAULT), 10),
    };
  }
}
