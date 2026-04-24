/**
 * Rate Limiting Configuration
 * Defines rate limiting strategies and constants
 */

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  max: number; // Maximum requests per window
  message?: string;
  statusCode?: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyGenerator?: (req: any) => string;
  skip?: (req: any) => boolean;
  handler?: (req: any, res: any) => void;
}

/**
 * Global rate limiting configuration
 */
export const RATE_LIMIT_CONFIG: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per 15 minutes
  statusCode: 429,
  message: 'Too many requests from this IP, please try again later.',
};

/**
 * Per-endpoint rate limiting configurations
 */
export const ENDPOINT_RATE_LIMITS: Record<string, { windowMs: number; max: number }> = {
  // Authentication endpoints (strict)
  'POST /auth/register': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 requests per hour
  },
  'POST /auth/login': {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per 15 minutes
  },
  'POST /auth/refresh': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 refreshes per hour
  },
  'POST /auth/request-password-reset': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 requests per hour
  },

  // Email verification (moderate)
  'POST /email-verification/send': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 verification emails per hour
  },
  'POST /email-verification/verify': {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 verification attempts
  },

  // User endpoints (moderate)
  'GET /users': {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
  },
  'POST /users': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 user creations per hour
  },

  // Property endpoints (moderate)
  'GET /properties': {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
  },
  'POST /properties': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 property creations per hour
  },

  // Dashboard (loose)
  'GET /dashboard': {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
  },

  // API Key endpoints
  'POST /auth/api-keys': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 key creations per hour
  },
};

/**
 * Per-user rate limiting configurations
 */
export const USER_TIER_RATE_LIMITS = {
  // Free tier
  free: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100, // 100 requests per hour
    monthlyLimit: 10000, // 10k requests per month
  },

  // Premium tier
  premium: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5000, // 5000 requests per hour
    monthlyLimit: 500000, // 500k requests per month
  },

  // Enterprise tier
  enterprise: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50000, // 50000 requests per hour
    monthlyLimit: Infinity, // Unlimited
  },

  // API Key special tier
  apiKey: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10000, // 10000 requests per hour
    monthlyLimit: 1000000, // 1M requests per month
  },
};

/**
 * Rate limit header names
 */
export const RATE_LIMIT_HEADERS = {
  LIMIT: 'X-RateLimit-Limit',
  REMAINING: 'X-RateLimit-Remaining',
  RESET: 'X-RateLimit-Reset',
  RETRY_AFTER: 'Retry-After',
};

/**
 * Rate limit key prefixes for Redis
 */
export const RATE_LIMIT_KEYS = {
  GLOBAL: 'rate-limit:global',
  ENDPOINT: (endpoint: string) => `rate-limit:endpoint:${endpoint}`,
  USER: (userId: string) => `rate-limit:user:${userId}`,
  IP: (ip: string) => `rate-limit:ip:${ip}`,
  API_KEY: (apiKey: string) => `rate-limit:api-key:${apiKey}`,
};

/**
 * Get rate limit config for user tier
 */
export function getUserTierRateLimit(
  tier: 'free' | 'premium' | 'enterprise' | 'apiKey' = 'free',
): RateLimitConfig {
  const tierConfig = USER_TIER_RATE_LIMITS[tier];
  return {
    windowMs: tierConfig.windowMs,
    max: tierConfig.max,
    statusCode: 429,
    message: `Rate limit exceeded for ${tier} tier. Max ${tierConfig.max} requests per ${tierConfig.windowMs / 1000} seconds.`,
  };
}

/**
 * Get rate limit config for endpoint
 */
export function getEndpointRateLimit(endpoint: string): RateLimitConfig | null {
  const config = ENDPOINT_RATE_LIMITS[endpoint];
  if (!config) return null;

  return {
    ...config,
    statusCode: 429,
    message: `Too many requests to ${endpoint}. Please try again later.`,
  };
}
