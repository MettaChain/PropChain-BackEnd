// Authentication type definitions

export interface AuthUser {
  id: string;
  email: string;
  walletAddress?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  isVerified: boolean;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface JwtPayload {
  sub: string;
  email: string;
  jti?: string;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    walletAddress?: string;
    isVerified: boolean;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface Web3LoginRequest {
  walletAddress: string;
  signature: string;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  walletAddress?: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirmRequest {
  token: string;
  newPassword: string;
}

export interface MfaSetupRequest {
  method: 'totp' | 'sms' | 'email';
  phoneNumber?: string;
  email?: string;
}

export interface MfaVerifyRequest {
  method: string;
  code: string;
}

export interface SessionInfo {
  userId: string;
  jti: string;
  createdAt: string;
  userAgent: string;
  ip: string;
  lastActivity?: string;
}

export interface LoginAttempt {
  email: string;
  ip: string;
  timestamp: Date;
  success: boolean;
  userAgent?: string;
}

export interface AccountLockInfo {
  email: string;
  ip: string;
  lockoutUntil: Date;
  failedAttempts: number;
  lastAttempt: Date;
}

export interface TokenBlacklistEntry {
  jti: string;
  userId: string;
  blacklistedAt: Date;
  reason?: string;
}

export interface AuthRequestContext {
  user?: AuthUser;
  session?: SessionInfo;
  ip: string;
  userAgent: string;
  timestamp: Date;
}