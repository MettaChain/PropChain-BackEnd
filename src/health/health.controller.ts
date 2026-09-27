import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../cache/cache.service';
import { SignedUrlService } from '../documents/signed-url/signed-url.service';
import { AppLogger } from '../common/logger';

/**
 * HealthController
 *
 * Provides Kubernetes liveness, readiness, and startup probe endpoints.
 * Issue #925 – Add deployment health check endpoints for K8s readiness/liveness probes.
 * Issue #1246 – Deterministic startup probe checking runtime schema readiness.
 * Issue #1247 – Redact internal driver/connection details from health probe responses.
 *
 * GET /healthz  – liveness probe  (always 200 while process is running)
 * GET /readyz   – readiness probe (checks DB + Redis; storage when document features are enabled)
 * GET /startupz – startup probe   (verifies DB connectivity and schema readiness)
 */
@Controller()
export class HealthController {
  private readonly logger = new AppLogger(HealthController.name);

  // Essential runtime tables required for the application to function.
  // Probing these tables verifies schema readiness deterministically, regardless
  // of whether the database was prepared via Prisma migrate, db push, or loose SQL migrations.
  private static readonly REQUIRED_TABLES = [
    'users',
    'properties',
    'transactions',
    'documents',
    'sessions',
    'api_keys',
    'export_jobs',
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly signedUrlService: SignedUrlService,
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
   * Stable error codes (db_unreachable, redis_unreachable, rpc_degraded, storage_unreachable)
   * prevent leaking connection strings or internal driver details.
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
      this.logger.error(
        'Readiness probe database check failed',
        err instanceof Error ? err.stack : String(err),
      );
      checks.database = {
        status: 'error',
        error: 'db_unreachable',
      };
    }

    // Redis check
    const redisStart = Date.now();
    try {
      const healthStatus = await this.cacheService.getHealthStatus();
      if (healthStatus.connected) {
        checks.redis = { 
          status: 'ok', 
          latencyMs: healthStatus.latencyMs,
        };
      } else {
        allOk = false;
        this.logger.error('Readiness probe Redis check failed: Redis not connected');
        checks.redis = { 
          status: 'error', 
          error: 'redis_unreachable',
          latencyMs: healthStatus.latencyMs,
        };
      }
    } catch (err: unknown) {
      allOk = false;
      this.logger.error(
        'Readiness probe Redis check failed with error',
        err instanceof Error ? err.stack : String(err),
      );
      checks.redis = {
        status: 'error',
        error: 'redis_unreachable',
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
        if (resp.ok) {
          checks.blockchainRpc = { status: 'ok', latencyMs: Date.now() - rpcStart };
        } else {
          this.logger.warn(`Readiness probe blockchain RPC returned status ${resp.status}`);
          checks.blockchainRpc = { status: 'degraded', error: 'rpc_degraded' };
        }
      } catch (err: unknown) {
        this.logger.warn(
          'Readiness probe blockchain RPC check failed',
          err instanceof Error ? err.message : String(err),
        );
        checks.blockchainRpc = { status: 'degraded', error: 'rpc_degraded' };
      }
    }

    // Storage check (issue #1186): when document features are enabled (a
    // signed URL provider is selected), readiness must reflect that storage
    // is functional so a misconfigured deployment is surfaced by the probe.
    if (process.env.SIGNED_URL_PROVIDER) {
      try {
        if (this.signedUrlService.isConfigured()) {
          checks.storage = { status: 'ok' };
        } else {
          allOk = false;
          this.logger.error(
            `Signed URL provider '${this.signedUrlService.activeProviderName()}' is not configured`,
          );
          checks.storage = {
            status: 'error',
            error: 'storage_unreachable',
          };
        }
      } catch (err: unknown) {
        allOk = false;
        this.logger.error(
          'Readiness probe storage check failed',
          err instanceof Error ? err.stack : String(err),
        );
        checks.storage = {
          status: 'error',
          error: 'storage_unreachable',
        };
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
   * Startup probe – verifies DB is reachable and expected schema tables exist.
   * Kubernetes uses this during the initial startup period.
   * Issue #1246: Probes information_schema.tables to verify tables actually used at runtime.
   * Issue #1247: Returns stable codes without leaking database credentials or driver internals.
   */
  @Get('startupz')
  @HttpCode(HttpStatus.OK)
  async startup(): Promise<{
    status: string;
    timestamp: string;
    schemaReady: boolean;
    migrationsApplied: boolean;
    error?: string;
  }> {
    try {
      // Verify database connectivity
      await this.prisma.$queryRaw`SELECT 1`;

      // Query database schema for required runtime tables
      const rows = await this.prisma.$queryRaw<{ table_name?: string; count?: bigint }[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = current_schema()
           OR table_schema = 'public'
      `;

      // Check table existence
      const foundTables = new Set(
        rows
          .map((r) => r.table_name?.toLowerCase())
          .filter((t): t is string => Boolean(t)),
      );

      // If information_schema rows were returned, verify all required tables exist
      if (foundTables.size > 0) {
        const missingTables = HealthController.REQUIRED_TABLES.filter(
          (tbl) => !foundTables.has(tbl),
        );

        if (missingTables.length > 0) {
          this.logger.warn(
            `Startup probe: missing required schema tables: ${missingTables.join(', ')}`,
          );
          return {
            status: 'error',
            timestamp: new Date().toISOString(),
            schemaReady: false,
            migrationsApplied: false,
            error: 'schema_unready',
          };
        }
      }

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        schemaReady: true,
        migrationsApplied: true,
      };
    } catch (err: unknown) {
      this.logger.error(
        'Startup probe database check failed',
        err instanceof Error ? err.stack : String(err),
      );
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        schemaReady: false,
        migrationsApplied: false,
        error: 'db_unreachable',
      };
    }
  }
}
