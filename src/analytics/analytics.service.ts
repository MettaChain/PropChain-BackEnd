import { Injectable } from '@nestjs/common';

interface RequestRecord {
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  timestamp: Date;
}

@Injectable()
export class AnalyticsService {
  private records: RequestRecord[] = [];
  private readonly MAX_RECORDS = 10000;

  record(data: Omit<RequestRecord, 'timestamp'>): void {
    this.records.push({ ...data, timestamp: new Date() });
    if (this.records.length > this.MAX_RECORDS) {
      this.records.shift();
    }
  }

  getStats() {
    const total = this.records.length;
    if (total === 0) return { total: 0, endpoints: [], errors: [], avgResponseTime: 0 };

    const endpointMap = new Map<string, { count: number; totalTime: number }>();
    const errorMap = new Map<number, number>();
    let totalTime = 0;

    for (const r of this.records) {
      const key = `${r.method} ${r.endpoint}`;
      const ep = endpointMap.get(key) ?? { count: 0, totalTime: 0 };
      ep.count++;
      ep.totalTime += r.responseTime;
      endpointMap.set(key, ep);

      totalTime += r.responseTime;

      if (r.statusCode >= 400) {
        errorMap.set(r.statusCode, (errorMap.get(r.statusCode) ?? 0) + 1);
      }
    }

    const endpoints = [...endpointMap.entries()]
      .map(([endpoint, { count, totalTime: t }]) => ({
        endpoint,
        count,
        avgResponseTime: Math.round(t / count),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const errors = [...errorMap.entries()].map(([statusCode, count]) => ({
      statusCode,
      count,
    }));

    return {
      total,
      avgResponseTime: Math.round(totalTime / total),
      endpoints,
      errors,
    };
  }

  reset(): void {
    this.records = [];
  }
}
