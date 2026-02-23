// API Key type definitions

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
  scopes: string[];
  requestCount: bigint;
  lastUsedAt?: Date;
  isActive: boolean;
  rateLimit?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateApiKeyDto {
  name: string;
  scopes: string[];
  rateLimit?: number;
}

export interface UpdateApiKeyDto {
  name?: string;
  scopes?: string[];
  rateLimit?: number;
  isActive?: boolean;
}

export interface ApiKeyQueryDto {
  page?: number;
  limit?: number;
  isActive?: boolean;
  search?: string;
}

export interface ApiKeyResponseDto {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  requestCount: string;
  lastUsedAt?: Date;
  isActive: boolean;
  rateLimit?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKeyValidationResult {
  isValid: boolean;
  apiKey?: ApiKey;
  error?: string;
  remainingRequests?: number;
  resetTime?: number;
}

export interface ApiKeyRateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: number;
  window: number;
}

export interface ApiKeyUsageStats {
  totalRequests: number;
  requestsToday: number;
  requestsThisMonth: number;
  averageDailyRequests: number;
  peakHour: number;
  lastUsedAt?: Date;
}

export interface ApiKeyScope {
  resource: string;
  action: string;
  description: string;
}

export interface ApiKeyWithUsage extends ApiKey {
  usageStats: ApiKeyUsageStats;
  rateLimitInfo: ApiKeyRateLimitInfo;
}

export interface ApiKeyRequestContext {
  apiKey?: ApiKey;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  endpoint: string;
  method: string;
}
