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
 */

import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { register, collectDefaultMetrics, Counter, Gauge, Histogram } from 'prom-client';

collectDefaultMetrics();

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
 * User registrations – increment via UserService on successful registration.
 */
export const userRegistrationsTotal = new Counter({
  name: 'business_user_registrations_total',
  help: 'Total number of user registrations',
  labelNames: ['method'] as const, // 'email' | 'google'
});

/**
 * Successful logins – increment via AuthService on successful login.
 */
export const userLoginsTotal = new Counter({
  name: 'business_user_logins_total',
  help: 'Total number of successful user logins',
  labelNames: ['method'] as const, // 'email' | 'google' | 'api-key'
});

/**
 * Transactions created – increment via TransactionsService.
 */
export const transactionsTotal = new Counter({
  name: 'business_transactions_total',
  help: 'Total number of real-estate transactions created',
  labelNames: ['type', 'status'] as const,
});

/**
 * Property listings created – increment via PropertiesService.
 */
export const propertiesTotal = new Counter({
  name: 'business_properties_total',
  help: 'Total number of property listings created',
});

/**
 * Documents uploaded – increment via DocumentsService.
 */
export const documentsTotal = new Counter({
  name: 'business_documents_total',
  help: 'Total number of documents uploaded',
  labelNames: ['document_type'] as const,
});

/**
 * Transaction value histogram – track the distribution of transaction amounts.
 * Buckets are tuned for real-estate values (USD).
 */
export const transactionValueHistogram = new Histogram({
  name: 'business_transaction_value_usd',
  help: 'Distribution of real-estate transaction values in USD',
  buckets: [50_000, 100_000, 200_000, 300_000, 500_000, 750_000, 1_000_000, 2_000_000, 5_000_000],
});

@Controller()
export class MetricsController {
  @Get('metrics')
  async getMetrics(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', register.contentType);
    res.end(await register.metrics());
  }
}
