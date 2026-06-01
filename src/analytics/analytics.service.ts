import { Injectable } from '@nestjs/common';

export interface RequestRecord {
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  userId: string | null;
  timestamp: Date;
}

export interface EndpointStats {
  endpoint: string;
  requestCount: number;
  errorCount: number;
  errorRate: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
}

export interface UserUsageStats {
  userId: string;
  requestCount: number;
  errorCount: number;
  avgResponseTime: number;
  lastSeen: Date;
}

export interface SlowEndpoint {
  endpoint: string;
  avgResponseTime: number;
  p95ResponseTime: number;
  requestCount: number;
}

export interface ApiMonitoringStats {
  window: string;
  totalRequests: number;
  totalErrors: number;
  overallErrorRate: number;
  avgResponseTime: number;
  requestsPerMinute: number;
  topEndpoints: EndpointStats[];
  slowEndpoints: SlowEndpoint[];
  errorsByStatus: Array<{ statusCode: number; count: number; rate: number }>;
  topUsers: UserUsageStats[];
}

@Injectable()
export class AnalyticsService {
  private records: RequestRecord[] = [];
  private readonly MAX_RECORDS = 50000;
  // Slow endpoint threshold in ms
  private readonly SLOW_THRESHOLD_MS = 1000;

  record(data: Omit<RequestRecord, 'timestamp'>): void {
    this.records.push({ ...data, timestamp: new Date() });
    if (this.records.length > this.MAX_RECORDS) {
      this.records.shift();
    }
  }

  /**
   * Returns records within the given time window (minutes).
   * Defaults to last 60 minutes.
   */
  private getWindowedRecords(windowMinutes = 60): RequestRecord[] {
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
    return this.records.filter((r) => r.timestamp >= cutoff);
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  getStats(windowMinutes = 60): ApiMonitoringStats {
    const records = this.getWindowedRecords(windowMinutes);
    const total = records.length;

    if (total === 0) {
      return {
        window: `${windowMinutes}m`,
        totalRequests: 0,
        totalErrors: 0,
        overallErrorRate: 0,
        avgResponseTime: 0,
        requestsPerMinute: 0,
        topEndpoints: [],
        slowEndpoints: [],
        errorsByStatus: [],
        topUsers: [],
      };
    }

    // --- Aggregate by endpoint ---
    const endpointMap = new Map<string, { count: number; errors: number; times: number[] }>();

    // --- Aggregate by user ---
    const userMap = new Map<
      string,
      { count: number; errors: number; totalTime: number; lastSeen: Date }
    >();

    // --- Aggregate by status code ---
    const statusMap = new Map<number, number>();

    let totalTime = 0;
    let totalErrors = 0;

    for (const r of records) {
      const key = `${r.method} ${r.endpoint}`;
      const ep = endpointMap.get(key) ?? { count: 0, errors: 0, times: [] };
      ep.count++;
      ep.times.push(r.responseTime);
      if (r.statusCode >= 400) ep.errors++;
      endpointMap.set(key, ep);

      totalTime += r.responseTime;
      if (r.statusCode >= 400) totalErrors++;

      statusMap.set(r.statusCode, (statusMap.get(r.statusCode) ?? 0) + 1);

      if (r.userId) {
        const u = userMap.get(r.userId) ?? {
          count: 0,
          errors: 0,
          totalTime: 0,
          lastSeen: r.timestamp,
        };
        u.count++;
        u.totalTime += r.responseTime;
        if (r.statusCode >= 400) u.errors++;
        if (r.timestamp > u.lastSeen) u.lastSeen = r.timestamp;
        userMap.set(r.userId, u);
      }
    }

    // --- Build endpoint stats ---
    const endpointStats: EndpointStats[] = [...endpointMap.entries()].map(
      ([endpoint, { count, errors, times }]) => {
        const sorted = [...times].sort((a, b) => a - b);
        return {
          endpoint,
          requestCount: count,
          errorCount: errors,
          errorRate: parseFloat(((errors / count) * 100).toFixed(2)),
          avgResponseTime: Math.round(times.reduce((a, b) => a + b, 0) / count),
          p95ResponseTime: this.percentile(sorted, 95),
          p99ResponseTime: this.percentile(sorted, 99),
        };
      },
    );

    const topEndpoints = [...endpointStats]
      .sort((a, b) => b.requestCount - a.requestCount)
      .slice(0, 10);

    const slowEndpoints: SlowEndpoint[] = endpointStats
      .filter((e) => e.avgResponseTime >= this.SLOW_THRESHOLD_MS)
      .sort((a, b) => b.avgResponseTime - a.avgResponseTime)
      .slice(0, 10)
      .map(({ endpoint, avgResponseTime, p95ResponseTime, requestCount }) => ({
        endpoint,
        avgResponseTime,
        p95ResponseTime,
        requestCount,
      }));

    // --- Error breakdown by status ---
    const errorsByStatus = [...statusMap.entries()]
      .filter(([code]) => code >= 400)
      .map(([statusCode, count]) => ({
        statusCode,
        count,
        rate: parseFloat(((count / total) * 100).toFixed(2)),
      }))
      .sort((a, b) => b.count - a.count);

    // --- Top users by request count ---
    const topUsers: UserUsageStats[] = [...userMap.entries()]
      .map(([userId, { count, errors, totalTime: ut, lastSeen }]) => ({
        userId,
        requestCount: count,
        errorCount: errors,
        avgResponseTime: Math.round(ut / count),
        lastSeen,
      }))
      .sort((a, b) => b.requestCount - a.requestCount)
      .slice(0, 20);

    const windowMs = windowMinutes * 60 * 1000;
    const requestsPerMinute = parseFloat(((total / windowMs) * 60000).toFixed(2));

    return {
      window: `${windowMinutes}m`,
      totalRequests: total,
      totalErrors,
      overallErrorRate: parseFloat(((totalErrors / total) * 100).toFixed(2)),
      avgResponseTime: Math.round(totalTime / total),
      requestsPerMinute,
      topEndpoints,
      slowEndpoints,
      errorsByStatus,
      topUsers,
    };
  }

  /**
   * Per-endpoint breakdown with full stats.
   */
  getEndpointStats(windowMinutes = 60): EndpointStats[] {
    return this.getStats(windowMinutes).topEndpoints;
  }

  /**
   * Usage breakdown for a specific user.
   */
  getUserStats(userId: string, windowMinutes = 60): UserUsageStats | null {
    const records = this.getWindowedRecords(windowMinutes).filter((r) => r.userId === userId);
    if (records.length === 0) return null;

    const errors = records.filter((r) => r.statusCode >= 400).length;
    const totalTime = records.reduce((s, r) => s + r.responseTime, 0);
    const lastSeen = records.reduce(
      (latest, r) => (r.timestamp > latest ? r.timestamp : latest),
      records[0].timestamp,
    );

    return {
      userId,
      requestCount: records.length,
      errorCount: errors,
      avgResponseTime: Math.round(totalTime / records.length),
      lastSeen,
    };
  }

  reset(): void {
    this.records = [];
  }
}
