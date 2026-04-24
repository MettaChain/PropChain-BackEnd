import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  RATE_LIMIT_KEYS,
  RATE_LIMIT_HEADERS,
  getEndpointRateLimit,
  getUserTierRateLimit,
} from './rate-limit.config';

export interface RateLimitStatus {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
  isExceeded: boolean;
}

export interface RateLimitRecord {
  count: number;
  resetAt: number;
  windowMs: number;
}

@Injectable()
export class RateLimitService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  /**
   * Check rate limit for a user
   */
  async checkUserRateLimit(
    userId: string,
    userTier: 'free' | 'premium' | 'enterprise' | 'apiKey' = 'free',
  ): Promise<RateLimitStatus> {
    const key = RATE_LIMIT_KEYS.USER(userId);
    const config = getUserTierRateLimit(userTier);

    return this.checkRateLimit(key, config.max, config.windowMs);
  }

  /**
   * Check rate limit for an IP
   */
  async checkIpRateLimit(ip: string): Promise<RateLimitStatus> {
    const key = RATE_LIMIT_KEYS.IP(ip);
    const limit = 1000; // Global IP limit
    const windowMs = 15 * 60 * 1000; // 15 minutes

    return this.checkRateLimit(key, limit, windowMs);
  }

  /**
   * Check rate limit for an endpoint
   */
  async checkEndpointRateLimit(endpoint: string): Promise<RateLimitStatus> {
    const config = getEndpointRateLimit(endpoint);
    if (!config) {
      // No specific endpoint limit
      return {
        limit: 0,
        remaining: 0,
        reset: 0,
        isExceeded: false,
      };
    }

    const key = RATE_LIMIT_KEYS.ENDPOINT(endpoint);
    return this.checkRateLimit(key, config.max, config.windowMs);
  }

  /**
   * Check rate limit for an API key
   */
  async checkApiKeyRateLimit(apiKey: string): Promise<RateLimitStatus> {
    const key = RATE_LIMIT_KEYS.API_KEY(apiKey);
    const config = getUserTierRateLimit('apiKey');

    return this.checkRateLimit(key, config.max, config.windowMs);
  }

  /**
   * Generic rate limit check
   */
  private async checkRateLimit(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitStatus> {
    try {
      const record = await this.cacheManager.get<RateLimitRecord>(key);
      const now = Date.now();

      let count = 1;
      let resetAt = now + windowMs;

      if (record && record.resetAt > now) {
        // Window still active
        count = record.count + 1;
        resetAt = record.resetAt;
      } else {
        // New window
        resetAt = now + windowMs;
      }

      const isExceeded = count > limit;

      // Store the updated record
      if (!isExceeded) {
        await this.cacheManager.set(
          key,
          { count, resetAt, windowMs },
          resetAt - now,
        );
      } else {
        // Still store the count for tracking
        await this.cacheManager.set(
          key,
          { count, resetAt, windowMs },
          resetAt - now,
        );
      }

      const remaining = Math.max(0, limit - count);
      const retryAfter = isExceeded ? Math.ceil((resetAt - now) / 1000) : undefined;

      return {
        limit,
        remaining,
        reset: Math.floor(resetAt / 1000), // Unix timestamp in seconds
        retryAfter,
        isExceeded,
      };
    } catch (error) {
      // If cache is unavailable, allow the request
      console.error('Rate limit check failed:', error);
      return {
        limit,
        remaining: limit - 1,
        reset: Math.floor((Date.now() + windowMs) / 1000),
        isExceeded: false,
      };
    }
  }

  /**
   * Reset rate limit for a user
   */
  async resetUserRateLimit(userId: string): Promise<void> {
    const key = RATE_LIMIT_KEYS.USER(userId);
    await this.cacheManager.del(key);
  }

  /**
   * Reset rate limit for an IP
   */
  async resetIpRateLimit(ip: string): Promise<void> {
    const key = RATE_LIMIT_KEYS.IP(ip);
    await this.cacheManager.del(key);
  }

  /**
   * Reset rate limit for an endpoint
   */
  async resetEndpointRateLimit(endpoint: string): Promise<void> {
    const key = RATE_LIMIT_KEYS.ENDPOINT(endpoint);
    await this.cacheManager.del(key);
  }

  /**
   * Reset rate limit for an API key
   */
  async resetApiKeyRateLimit(apiKey: string): Promise<void> {
    const key = RATE_LIMIT_KEYS.API_KEY(apiKey);
    await this.cacheManager.del(key);
  }

  /**
   * Get rate limit status with headers
   */
  getHeaders(status: RateLimitStatus): Record<string, string> {
    const headers: Record<string, string> = {
      [RATE_LIMIT_HEADERS.LIMIT]: status.limit.toString(),
      [RATE_LIMIT_HEADERS.REMAINING]: status.remaining.toString(),
      [RATE_LIMIT_HEADERS.RESET]: status.reset.toString(),
    };

    if (status.retryAfter) {
      headers[RATE_LIMIT_HEADERS.RETRY_AFTER] = status.retryAfter.toString();
    }

    return headers;
  }

  /**
   * Get all rate limit stats for a user
   */
  async getUserRateLimitStats(userId: string): Promise<{
    ip?: RateLimitStatus;
    user?: RateLimitStatus;
    reset?: Date;
  }> {
    const userLimit = await this.checkUserRateLimit(userId);
    return {
      user: userLimit,
      reset: new Date(userLimit.reset * 1000),
    };
  }
}
