/**
 * MetricsController
 *
 * Exposes the Prometheus /metrics endpoint.
 * Issue #915 – Add custom business metrics beyond default Node.js metrics.
 *
 * Metrics exposed:
 *   http_requests_total            – HTTP request count by method/path/status
 *   http_request_duration_ms       – HTTP latency histogram
 *   prisma_pool_active_connections – active DB connections
 *   prisma_pool_idle_connections   – idle DB connections
 *   cache_hit_ratio                – cache hit ratio
 *   slow_queries_total             – count of slow queries (>100ms dev, >200ms prod)
 *   business_user_registrations_total   – user registrations
 *   business_user_logins_total          – successful login count
 *   business_transactions_total         – transactions created
 *   business_properties_total           – property listings created
 *   business_documents_total            – documents uploaded
 *   analytics_request_logs_written_total       – RequestLog rows persisted
 *   analytics_request_log_write_failures_total – analytics write failures (#1296)
 */

import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { register, collectDefaultMetrics, Counter, Gauge, Histogram } from 'prom-client';
import { MetricsAuthGuard } from './metrics-auth.guard';

// Clamp default-metrics cardinality: collect standard metrics without unbounded custom labels
// and ensure single invocation across hot-reloads and test suites.
if (!register.getSingleMetric('process_cpu_user_seconds_total')) {
  collectDefaultMetrics({
    prefix: '',
    labels: {},
  });
}

// ── HTTP metrics ─────────────────────────────────────────────────────────────

export const httpRequestCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP request count',
  labelNames: ['method', 'path', 'status'] as const,
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'path'] as const,
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500],
});

// ── Database / pool metrics ───────────────────────────────────────────────────

export const prismaPoolActive = new Gauge({
  name: 'prisma_pool_active_connections',
  help: 'Active Prisma database connections',
});

export const prismaPoolIdle = new Gauge({
  name: 'prisma_pool_idle_connections',
  help: 'Idle Prisma database connections',
});

/**
 * Counter incremented by PrismaService whenever a slow query is detected.
 * Issue #917 dependency.
 */
export const slowQueryCounter = new Counter({
  name: 'slow_queries_total',
  help: 'Number of database queries exceeding the slow-query threshold',
});

// ── Cache metrics ─────────────────────────────────────────────────────────────

export const cacheHitRatio = new Gauge({
  name: 'cache_hit_ratio',
  help: 'Cache hit ratio (0-1)',
});

// ── Business metrics ──────────────────────────────────────────────────────────

/**
 * User registrations – increment via AuthService / UserService on successful registration.
 *
 * Label cardinality: 2
 *   - method: 'email' | 'google'
 */
export const userRegistrationsTotal = new Counter({
  name: 'business_user_registrations_total',
  help: 'Total number of user registrations',
  labelNames: ['method'] as const,
});

/**
 * Successful logins – increment via AuthService on successful login or API key validation.
 *
 * Label cardinality: 3
 *   - method: 'email' | 'google' | 'api-key'
 */
export const userLoginsTotal = new Counter({
  name: 'business_user_logins_total',
  help: 'Total number of successful user logins',
  labelNames: ['method'] as const,
});

/**
 * Transactions created – increment via TransactionsService.
 *
 * Label cardinality: 9 combinations
 *   - type: 'SALE' | 'PURCHASE' | 'TRANSFER' (3 values)
 *   - status: 'PENDING' | 'COMPLETED' | 'CANCELLED' (3 values)
 */
export const transactionsTotal = new Counter({
  name: 'business_transactions_total',
  help: 'Total number of real-estate transactions created',
  labelNames: ['type', 'status'] as const,
});

/**
 * Property listings created – increment via PropertiesService.
 *
 * Label cardinality: 1 (no labels)
 */
export const propertiesTotal = new Counter({
  name: 'business_properties_total',
  help: 'Total number of property listings created',
});

/**
 * Documents uploaded – increment via DocumentsService.
 *
 * Label cardinality: 7 (bounded to DocumentType enum)
 *   - document_type: 'TITLE_DEED' | 'INSPECTION_REPORT' | 'APPRAISAL' | 'CONTRACT' | 'DISCLOSURE' | 'PHOTO' | 'FLOOR_PLAN'
 */
export const documentsTotal = new Counter({
  name: 'business_documents_total',
  help: 'Total number of documents uploaded',
  labelNames: ['document_type'] as const,
});

/**
 * Missing i18n translation keys – increment when I18nService.tFor falls back to the raw key.
 * Issue #1236.
 */
export const translationsMissingTotal = new Counter({
  name: 'translations_missing_total',
  help: 'Total number of missing translation key lookups',
  labelNames: ['key', 'language'] as const,
});

/**
 * Transaction value histogram – track the distribution of transaction amounts.
 * Buckets are tuned for real-estate values (USD).
 *
 * Label cardinality: none (9 histogram buckets)
 */
export const transactionValueHistogram = new Histogram({
  name: 'business_transaction_value_usd',
  help: 'Distribution of real-estate transaction values in USD',
  buckets: [50_000, 100_000, 200_000, 300_000, 500_000, 750_000, 1_000_000, 2_000_000, 5_000_000],
});

// ── Analytics pipeline metrics (issue #1296) ──────────────────────────────────

/**
 * RequestLog rows persisted by the analytics pipeline.
 *
 * Label cardinality: 2
 *   - source: 'memory' | 'redis'
 */
export const analyticsRecordsWrittenTotal = new Counter({
  name: 'analytics_request_logs_written_total',
  help: 'Total RequestLog records persisted by the analytics pipeline',
  labelNames: ['source'] as const,
});

/**
 * Analytics write failures, split by the stage that failed (issue #1296).
 *
 * Label cardinality: 2
 *   - stage: 'buffer' (coalescing into Redis/memory) | 'flush' (DB persist)
 */
export const analyticsWriteFailuresTotal = new Counter({
  name: 'analytics_request_log_write_failures_total',
  help: 'Total failures while coalescing or persisting analytics request logs',
  labelNames: ['stage'] as const,
});

@Controller()
@UseGuards(MetricsAuthGuard)
export class MetricsController {
  @Get('metrics')
  async getMetrics(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', register.contentType);
    res.end(await register.metrics());
  }
}
