/**
 * Redis-backed geo cache for the geographic IP middleware (#1610).
 *
 * The middleware only needs `get`/`set`, so this adapter is intentionally
 * small. A missing/unreachable Redis instance is reported by the middleware
 * (logs and continues with a direct lookup) once the promise rejects; it must
 * never prevent a request from being served.
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { GeoCache } from './geographic-ip.types';

@Injectable()
export class RedisGeoCache implements GeoCache, OnModuleDestroy {
  private readonly logger = new Logger(RedisGeoCache.name);
  private readonly client: Redis;

  constructor(url: string) {
    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2_000,
    });
    this.client.on('error', (error: Error) => {
      this.logger.debug(`Redis geo cache error: ${error.message}`);
    });
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<unknown> {
    return this.client.set(key, value, 'EX', ttlSeconds);
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
