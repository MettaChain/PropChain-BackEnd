/**
 * Cache Monitoring Service
 * Monitors cache performance, hits/misses, and health
 */

import { Injectable, Logger } from '@nestjs/common';

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  totalRequests: number;
  avgResponseTime: number;
  timestamp: Date;
}

export interface CacheHealthStatus {
  isConnected: boolean;
  memoryUsage: number;
  keysCount: number;
  uptime: number;
  commandsProcessed: number;
}

@Injectable()
export class CacheMonitoringService {
  private readonly logger = new Logger(CacheMonitoringService.name);

  private metrics = {
    hits: 0,
    misses: 0,
    totalRequests: 0,
    responseTimes: [] as number[],
  };

  /**
   * Record cache hit
   */
  recordHit(): void {
    this.metrics.hits++;
    this.metrics.totalRequests++;
  }

  /**
   * Record cache miss
   */
  recordMiss(): void {
    this.metrics.misses++;
    this.metrics.totalRequests++;
  }

  /**
   * Record response time
   */
  recordResponseTime(timeMs: number): void {
    this.metrics.responseTimes.push(timeMs);
    // Keep only last 1000 measurements
    if (this.metrics.responseTimes.length > 1000) {
      this.metrics.responseTimes.shift();
    }
  }

  /**
   * Get current cache metrics
   */
  getMetrics(): CacheMetrics {
    const hitRate =
      this.metrics.totalRequests > 0 ? (this.metrics.hits / this.metrics.totalRequests) * 100 : 0;

    const avgResponseTime =
      this.metrics.responseTimes.length > 0
        ? this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length
        : 0;

    return {
      hits: this.metrics.hits,
      misses: this.metrics.misses,
      hitRate: parseFloat(hitRate.toFixed(2)),
      totalRequests: this.metrics.totalRequests,
      avgResponseTime: parseFloat(avgResponseTime.toFixed(2)),
      timestamp: new Date(),
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      totalRequests: 0,
      responseTimes: [],
    };
    this.logger.log('Cache metrics reset');
  }

  /**
   * Get cache alerts based on performance
   */
  getAlerts(): string[] {
    const alerts: string[] = [];
    const metrics = this.getMetrics();

    // Alert if hit rate is too low
    if (metrics.hitRate < 30 && metrics.totalRequests > 100) {
      alerts.push(`⚠️ Low cache hit rate: ${metrics.hitRate}%`);
    }

    // Alert if average response time is high
    if (metrics.avgResponseTime > 100) {
      alerts.push(`⚠️ High average response time: ${metrics.avgResponseTime}ms`);
    }

    return alerts;
  }

  /**
   * Log cache performance summary
   */
  logSummary(): void {
    const metrics = this.getMetrics();
    this.logger.log(
      `Cache Performance - Hits: ${metrics.hits}, Misses: ${metrics.misses}, ` +
        `Hit Rate: ${metrics.hitRate}%, Avg Response: ${metrics.avgResponseTime}ms`,
    );
  }
}
