/**
 * PrismaService
 *
 * Wraps PrismaClient with lifecycle hooks and PgBouncer-compatible connection
 * configuration.  When the DATABASE_URL contains `?pgbouncer=true` or the
 * environment variable PGBOUNCER_ENABLED is set, the client is started in
 * PgBouncer mode which disables Prisma's built-in connection pooler and relies
 * on the external PgBouncer sidecar instead.
 *
 * Issue #917 – DB query logging and slow query detection.
 * Issue #921 – DB transaction retry logic for deadlock/serialization failures.
 *
 * Pool metrics are exported to Prometheus when MetricsModule is available.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const POOL_SIZE_DEFAULT = 10;
const POOL_TIMEOUT_MS = 10_000;

/** Slow-query thresholds (ms). Queries exceeding these trigger a warning log. */
const SLOW_QUERY_THRESHOLD_DEV = 100;
const SLOW_QUERY_THRESHOLD_PROD = 200;

/** Maximum number of automatic retries for transient DB errors. */
const DEFAULT_MAX_RETRIES = 3;

/** Error codes that are safe to retry. */
const RETRYABLE_ERROR_CODES = new Set([
  'P2034', // Transaction failed due to a write conflict or deadlock
  '40001', // Serialization failure
  '40P01', // Deadlock detected
  '57P03', // Database is shutting down
]);

/**
 * Determines whether the given Prisma / Postgres error is transient and safe
 * to retry.
 */
function isRetryableError(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const code: string = (err as Record<string, unknown>).code as string;
    if (code && RETRYABLE_ERROR_CODES.has(code)) return true;

    // Prisma error message patterns
    const message: string = ((err as Record<string, unknown>).message as string) ?? '';
    if (
      message.includes('deadlock') ||
      message.includes('serialization') ||
      message.includes('could not serialize') ||
      message.includes('Transaction failed due to a write conflict')
    ) {
      return true;
    }
  }
  return false;
}

/** Exponential back-off helper (capped at 1 s). */
function backoffMs(attempt: number): number {
  return Math.min(50 * Math.pow(2, attempt), 1000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const isPgbouncerEnabled =
      process.env.PGBOUNCER_ENABLED === 'true' ||
      (process.env.DATABASE_URL ?? '').includes('pgbouncer=true');

    const poolSize = parseInt(process.env.PGBOUNCER_POOL_SIZE ?? String(POOL_SIZE_DEFAULT), 10);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const poolTimeout = parseInt(process.env.PGBOUNCER_POOL_TIMEOUT ?? String(POOL_TIMEOUT_MS), 10);

    const isProduction = process.env.NODE_ENV === 'production';

    // In development we emit all log levels; in production only errors/warnings.
    const logLevels = isProduction
      ? (['error', 'warn'] as const)
      : (['error', 'warn', 'info', 'query'] as const);

    super({
      log: logLevels.map((level) => ({ level, emit: 'event' })),
      ...(isPgbouncerEnabled
        ? {
            datasources: {
              db: {
                url: process.env.DATABASE_URL,
              },
            },
          }
        : {}),
    });

    this.logger.log(
      `PrismaService initialised – PgBouncer: ${isPgbouncerEnabled}, pool size: ${poolSize}`,
    );

    // ── Query event logging & slow query detection (#917) ─────────────────
    const slowThreshold = isProduction ? SLOW_QUERY_THRESHOLD_PROD : SLOW_QUERY_THRESHOLD_DEV;

    // Issue #911 – N+1 detection: track how many queries are fired in a short
    // rolling window per table.  If the same table is queried more than the
    // N1_REPETITION_THRESHOLD times within N1_WINDOW_MS milliseconds we emit a
    // warning so the pattern can be caught in development before it reaches
    // production.
    const N1_WINDOW_MS = 100;
    const N1_REPETITION_THRESHOLD = 5;
    const queryWindow: Map<string, number[]> = new Map();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).$on('query', (event: { query: string; params: string; duration: number }) => {
      const { duration, query } = event;

      if (duration >= slowThreshold) {
        // Sanitise query – never log raw params to avoid leaking PII (#917 requirement)
        const sanitised = query.replace(/\$\d+/g, '?').substring(0, 300);
        this.logger.warn(
          `[SlowQuery] ${duration}ms (threshold: ${slowThreshold}ms) – ${sanitised}`,
        );

        // Export to Prometheus if available
        try {
          // Dynamic import to avoid circular dependency at startup
          void import('../metrics/metrics.controller').then(({ slowQueryCounter }) => {
            if (slowQueryCounter) slowQueryCounter.inc();
          });
        } catch {
          // metrics module not available
        }
      } else if (!isProduction) {
        this.logger.debug(`[Query] ${duration}ms`);
      }

      // Issue #911 – N+1 detection (development + staging only; skipped in
      // production to avoid overhead in hot paths).
      if (!isProduction) {
        // Extract the primary table name from the query (heuristic: first word
        // after SELECT/INSERT/UPDATE/DELETE ... FROM/INTO/UPDATE).
        const tableMatch = query.match(/(?:FROM|INTO|UPDATE)\s+"?(\w+)"?/i);
        if (tableMatch) {
          const table = tableMatch[1];
          const now = Date.now();
          const timestamps = (queryWindow.get(table) ?? []).filter((t) => now - t < N1_WINDOW_MS);
          timestamps.push(now);
          queryWindow.set(table, timestamps);

          if (timestamps.length === N1_REPETITION_THRESHOLD) {
            const sanitised = query.replace(/\$\d+/g, '?').substring(0, 200);
            this.logger.warn(
              `[N+1 Detected] Table "${table}" queried ${timestamps.length} times ` +
                `within ${N1_WINDOW_MS}ms. Possible N+1 pattern. Last query: ${sanitised}`,
            );
          }
        }
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).$on('warn', (event: { message: string }) => {
      this.logger.warn(`[Prisma] ${event.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();

    try {
      const { prismaPoolActive, prismaPoolIdle } = await import('../metrics/metrics.controller');
      setInterval(() => {
        const pool = (this as unknown as Record<string, unknown>)._engine as
          | {
              connectionPool?: {
                active?: { count?: () => number };
                idle?: { count?: () => number };
              };
            }
          | undefined;
        if (pool?.connectionPool) {
          prismaPoolActive.set(pool.connectionPool.active?.count?.() ?? 0);
          prismaPoolIdle.set(pool.connectionPool.idle?.count?.() ?? 0);
        }
      }, 10_000);
      this.logger.log('Prisma pool metrics exported to Prometheus');
    } catch {
      this.logger.debug('MetricsModule not available, skipping pool metric export');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Return a snapshot of the current connection pool state.
   * Used by the health check endpoint (issue #916).
   */
  getPoolMetrics(): { active: number; idle: number; poolSize: number } {
    const engine = (this as unknown as Record<string, unknown>)._engine as
      | { connectionPool?: { active?: { count?: () => number }; idle?: { count?: () => number } } }
      | undefined;
    return {
      active: engine?.connectionPool?.active?.count?.() ?? 0,
      idle: engine?.connectionPool?.idle?.count?.() ?? 0,
      poolSize: parseInt(process.env.PGBOUNCER_POOL_SIZE ?? String(POOL_SIZE_DEFAULT), 10),
    };
  }

  /**
   * Execute a function inside a Prisma interactive transaction with automatic
   * retry on deadlock / serialization failures.
   *
   * Issue #921 – DB transaction retry logic.
   *
   * @param fn        – callback that receives a transactional PrismaClient
   * @param maxRetries – max retry attempts (default: 3)
   */
  async withRetry<T>(
    fn: (
      tx: Omit<
        PrismaService,
        | 'withRetry'
        | '$connect'
        | '$disconnect'
        | '$on'
        | '$transaction'
        | '$extends'
        | 'getPoolMetrics'
      >,
    ) => Promise<T>,
    maxRetries: number = DEFAULT_MAX_RETRIES,
  ): Promise<T> {
    let attempt = 0;

    while (true) {
      try {
        return await this.$transaction((tx) =>
          fn(
            tx as unknown as Omit<
              PrismaService,
              | 'withRetry'
              | '$connect'
              | '$disconnect'
              | '$on'
              | '$transaction'
              | '$extends'
              | 'getPoolMetrics'
            >,
          ),
        );
      } catch (err: unknown) {
        attempt++;

        if (!isRetryableError(err) || attempt > maxRetries) {
          if (attempt > 1) {
            this.logger.warn(
              `Transaction failed after ${attempt - 1} retry/retries – giving up. Error: ${
                (err as Error)?.message ?? String(err)
              }`,
            );
          }
          throw err;
        }

        const delay = backoffMs(attempt - 1);
        this.logger.warn(
          `Retryable transaction error (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms. ` +
            `Code: ${(err as Record<string, unknown>).code ?? 'unknown'}`,
        );
        await sleep(delay);
      }
    }
  }
}
