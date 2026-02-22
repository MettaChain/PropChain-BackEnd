import { Injectable } from '@nestjs/common';

interface HttpRequestMetricKey {
  method: string;
  path: string;
}

interface HttpRequestMetricValue {
  count: number;
  totalDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  statusCounts: Record<number, number>;
}

interface ErrorMetricValue {
  count: number;
}

@Injectable()
export class MetricsService {
  private httpRequestMetrics = new Map<string, HttpRequestMetricValue>();
  private errorMetrics = new Map<string, ErrorMetricValue>();

  recordHttpRequest(method: string, path: string, statusCode: number, durationMs: number): void {
    const key: HttpRequestMetricKey = { method, path };
    const mapKey = this.buildHttpKey(key);
    const existing = this.httpRequestMetrics.get(mapKey);

    if (!existing) {
      this.httpRequestMetrics.set(mapKey, {
        count: 1,
        totalDurationMs: durationMs,
        minDurationMs: durationMs,
        maxDurationMs: durationMs,
        statusCounts: { [statusCode]: 1 },
      });
      return;
    }

    existing.count += 1;
    existing.totalDurationMs += durationMs;
    existing.minDurationMs = Math.min(existing.minDurationMs, durationMs);
    existing.maxDurationMs = Math.max(existing.maxDurationMs, durationMs);
    existing.statusCounts[statusCode] = (existing.statusCounts[statusCode] || 0) + 1;
  }

  recordError(type: string, metadata?: Record<string, any>): void {
    const key = type;
    const existing = this.errorMetrics.get(key);

    if (!existing) {
      this.errorMetrics.set(key, { count: 1 });
      return;
    }

    existing.count += 1;
  }

  getMetrics(): Record<string, any> {
    const http: Record<string, any> = {};

    for (const [key, value] of this.httpRequestMetrics.entries()) {
      http[key] = {
        count: value.count,
        avgDurationMs: value.count > 0 ? value.totalDurationMs / value.count : 0,
        minDurationMs: value.minDurationMs,
        maxDurationMs: value.maxDurationMs,
        statusCounts: value.statusCounts,
      };
    }

    const errors: Record<string, any> = {};

    for (const [key, value] of this.errorMetrics.entries()) {
      errors[key] = {
        count: value.count,
      };
    }

    return {
      http,
      errors,
    };
  }

  private buildHttpKey(key: HttpRequestMetricKey): string {
    return `${key.method.toUpperCase()} ${key.path}`;
  }
}
