/**
 * Redis Cache Configuration
 * Comprehensive caching setup with custom strategies
 */

import { CacheModuleOptions } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';

export const REDIS_CONFIG: CacheModuleOptions = {
  isGlobal: true,
  store: redisStore as any,
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  ttl: 600, // Default TTL: 10 minutes
};

/**
 * Cache key constants
 */
export const CACHE_KEYS = {
  // User cache keys
  USER_BY_ID: (id: string) => `user:${id}`,
  USER_BY_EMAIL: (email: string) => `user:email:${email}`,
  USERS_LIST: 'users:list',
  USERS_SEARCH: (query: string) => `users:search:${query}`,

  // Property cache keys
  PROPERTY_BY_ID: (id: string) => `property:${id}`,
  PROPERTIES_LIST: 'properties:list',
  PROPERTIES_SEARCH: (query: string) => `properties:search:${query}`,
  PROPERTIES_FEATURED: 'properties:featured',

  // Dashboard cache keys
  DASHBOARD_STATS: (userId: string) => `dashboard:stats:${userId}`,
  DASHBOARD_ANALYTICS: (userId: string) => `dashboard:analytics:${userId}`,

  // Trust score cache keys
  TRUST_SCORE: (userId: string) => `trust-score:${userId}`,
  TRUST_SCORES_LEADERBOARD: 'trust-scores:leaderboard',

  // Session cache keys
  SESSION_BY_ID: (id: string) => `session:${id}`,
  SESSIONS_BY_USER: (userId: string) => `sessions:user:${userId}`,

  // Authentication cache keys
  AUTH_TOKENS: (userId: string) => `auth:tokens:${userId}`,
  API_KEY_VALID: (key: string) => `api-key:valid:${key}`,

  // Email verification cache keys
  EMAIL_VERIFICATION: (email: string) => `email-verify:${email}`,

  // Rate limiting cache keys
  RATE_LIMIT_LOGIN: (email: string) => `rate-limit:login:${email}`,
  RATE_LIMIT_API: (apiKey: string) => `rate-limit:api:${apiKey}`,
};

/**
 * Cache TTL configurations (in seconds)
 */
export const CACHE_TTL = {
  // Short term cache (1-5 minutes)
  SHORT: 300,

  // Medium term cache (5-15 minutes)
  MEDIUM: 900,

  // Long term cache (1 hour)
  LONG: 3600,

  // Very long cache (1 day)
  VERY_LONG: 86400,

  // Trust score specific
  TRUST_SCORE: 3600, // 1 hour
  LEADERBOARD: 1800, // 30 minutes

  // Dashboard specific
  DASHBOARD_STATS: 600, // 10 minutes
  DASHBOARD_ANALYTICS: 1800, // 30 minutes

  // Featured properties
  FEATURED_PROPERTIES: 3600, // 1 hour

  // Search results (shorter, as data changes frequently)
  SEARCH_RESULTS: 300, // 5 minutes

  // User profile
  USER_PROFILE: 1800, // 30 minutes

  // Session data
  SESSION: 7200, // 2 hours

  // Email verification
  EMAIL_VERIFICATION: 600, // 10 minutes

  // Rate limiting
  RATE_LIMIT: 900, // 15 minutes
};

/**
 * Cache tags for grouped invalidation
 */
export const CACHE_TAGS = {
  USERS: 'users',
  PROPERTIES: 'properties',
  DASHBOARD: 'dashboard',
  TRUST_SCORE: 'trust-score',
  SESSIONS: 'sessions',
  AUTHENTICATION: 'authentication',
  EMAIL: 'email',
  RATE_LIMIT: 'rate-limit',
};

/**
 * Get Redis connection string
 */
export function getRedisConnectionString(): string {
  const password = process.env.REDIS_PASSWORD ? `${process.env.REDIS_PASSWORD}@` : '';
  const host = process.env.REDIS_HOST || 'localhost';
  const port = process.env.REDIS_PORT || '6379';
  const db = process.env.REDIS_DB || '0';

  return `redis://${password}${host}:${port}/${db}`;
}

/**
 * Get Redis configuration from environment
 */
export function getRedisConfig() {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  };
}
