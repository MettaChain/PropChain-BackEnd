// Security-related type definitions

// Authentication types
export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  permissions: string[];
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
  mfaRequired?: boolean;
  mfaMethods?: string[];
}

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  permissions: string[];
  isVerified: boolean;
  lastLogin?: Date;
}

// MFA types
export interface MfaSetup {
  method: 'totp' | 'sms' | 'email' | 'backup_codes';
  secret?: string;
  backupCodes?: string[];
  phoneNumber?: string;
  email?: string;
  qrCode?: string;
}

export interface MfaVerification {
  method: string;
  code: string;
  userId: string;
}

export interface MfaChallenge {
  challengeId: string;
  method: string;
  expiresAt: Date;
  attempts: number;
}

// Rate limiting types
export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  statusCode?: number;
  skip?: (request: any, response: any) => boolean;
  keyGenerator?: (request: any, response: any) => string;
  handler?: (request: any, response: any, next: any) => void;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: number;
  window: number;
}

// IP blocking types
export interface IpBlockEntry {
  ip: string;
  reason: string;
  blockedAt: Date;
  expiresAt?: Date;
  attempts: number;
}

export interface IpBlockConfig {
  maxAttempts: number;
  blockDuration: number;
  whitelist: string[];
  blacklist: string[];
}

// Security event types
export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  ipAddress: string;
  userAgent?: string;
  details: Record<string, any>;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export type SecurityEventType =
  | 'failed_login'
  | 'successful_login'
  | 'password_reset'
  | 'mfa_setup'
  | 'mfa_verification'
  | 'suspicious_activity'
  | 'brute_force_attempt'
  | 'unauthorized_access'
  | 'token_compromise'
  | 'api_key_compromise';

// API Security types
export interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimit?: number;
  isActive: boolean;
  createdAt: Date;
  lastUsedAt?: Date;
}

export interface ApiKeyValidationResult {
  isValid: boolean;
  keyInfo?: ApiKeyInfo;
  error?: string;
  remainingRequests?: number;
  resetTime?: number;
}

// XSS and SQL Injection protection types
export interface SanitizationOptions {
  stripTags?: boolean;
  encodeEntities?: boolean;
  allowedTags?: string[];
  allowedAttributes?: Record<string, string[]>;
}

export interface SqlInjectionPattern {
  pattern: RegExp;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

// Security headers configuration
export interface SecurityHeadersConfig {
  hsts?: {
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  };
  contentSecurityPolicy?: Record<string, string[]>;
  xFrameOptions?: 'DENY' | 'SAMEORIGIN';
  xContentTypeOptions?: 'nosniff';
  referrerPolicy?: string;
  permissionsPolicy?: Record<string, string>;
}

// Audit trail types
export interface AuditTrailEntry {
  id: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  changes: {
    before?: any;
    after?: any;
  };
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    requestId?: string;
  };
  timestamp: Date;
  signature?: string; // For tamper detection
}
