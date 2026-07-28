import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../cache/cache.service';

/**
 * HealthController
 *
 * Provides Kubernetes liveness, readiness, and startup probe endpoints.
 * Issue #925 – Add deployment health check endpoints for K8s readiness/liveness probes.
 *
 * GET /healthz  – liveness probe  (always 200 while process is running)
 * GET /readyz   – readiness probe (checks DB + Redis)
 * GET /startupz – startup probe   (verifies DB connectivity and migration state)
 */
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Liveness probe – returns 200 immediately.
   * Kubernetes uses this to decide whether to restart the container.
   */
  @Get('healthz')
  @HttpCode(HttpStatus.OK)
  liveness(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness probe – checks database and Redis connectivity.
   * Kubernetes uses this to decide whether to route traffic to the pod.
   */
  @Get('readyz')
  @HttpCode(HttpStatus.OK)
  async readiness(): Promise<{
    status: string;
    timestamp: string;
    checks: Record<string, { status: string; latencyMs?: number; error?: string }>;
  }> {
    const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};
    let allOk = true;

    // Database check
    const dbStart = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
    } catch (err: unknown) {
      allOk = false;
      checks.database = {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // Redis check
    const redisStart = Date.now();
    try {
      const connected = await this.cacheService.isConnected();
      if (connected) {
        checks.redis = { status: 'ok', latencyMs: Date.now() - redisStart };
      } else {
        allOk = false;
        checks.redis = { status: 'error', error: 'Redis not connected' };
      }
    } catch (err: unknown) {
      allOk = false;
      checks.redis = {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // Blockchain RPC check (optional – degraded only, not hard fail)
    if (process.env.BLOCKCHAIN_RPC_URL) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const rpcStart = Date.now();
        const resp = await fetch(process.env.BLOCKCHAIN_RPC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        checks.blockchainRpc = resp.ok
          ? { status: 'ok', latencyMs: Date.now() - rpcStart }
          : { status: 'degraded', error: `HTTP ${resp.status}` };
      } catch {
        checks.blockchainRpc = { status: 'degraded', error: 'RPC unreachable' };
      }
    }

    const responseStatus = allOk ? 'ok' : 'degraded';
    return {
      status: responseStatus,
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  /**
   * Startup probe – verifies DB is reachable and Prisma migrations are applied.
   * Kubernetes uses this during the initial startup period.
   */
  @Get('startupz')
  @HttpCode(HttpStatus.OK)
  async startup(): Promise<{
    status: string;
    timestamp: string;
    migrationsApplied: boolean;
    error?: string;
  }> {
    try {
      // Verify database connectivity
      await this.prisma.$queryRaw`SELECT 1`;

      // Verify migrations table exists and has entries
      const result = await this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count
        FROM "_prisma_migrations"
        WHERE "finished_at" IS NOT NULL
      `;
      const migrationCount = Number(result[0]?.count ?? 0);
      const migrationsApplied = migrationCount > 0;

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        migrationsApplied,
      };
    } catch (err: unknown) {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        migrationsApplied: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
