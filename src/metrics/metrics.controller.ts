import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { register, collectDefaultMetrics, Counter, Gauge, Histogram } from 'prom-client';

collectDefaultMetrics();

export const httpRequestCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP request count',
  labelNames: ['method', 'path', 'status'],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'path'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500],
});

export const prismaPoolActive = new Gauge({
  name: 'prisma_pool_active_connections',
  help: 'Active Prisma database connections',
});

export const prismaPoolIdle = new Gauge({
  name: 'prisma_pool_idle_connections',
  help: 'Idle Prisma database connections',
});

export const cacheHitRatio = new Gauge({
  name: 'cache_hit_ratio',
  help: 'Cache hit ratio (0-1)',
});

@Controller()
export class MetricsController {
  @Get('metrics')
  async getMetrics(@Res() res: Response) {
    res.setHeader('Content-Type', register.contentType);
    res.end(await register.metrics());
  }
}
