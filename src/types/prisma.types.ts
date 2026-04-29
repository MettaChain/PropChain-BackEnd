// Temporary Prisma types to work around generation issues
export interface User {
  id: string;
  email: string;
  password: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: string;
  isVerified: boolean;
  isBlocked: boolean;
  isDeactivated: boolean;
  deactivatedAt: Date | null;
  scheduledDeletionAt: Date | null;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  twoFactorBackupCodes: string[];
  avatar: string | null;
  pendingEmail: string | null;
  emailVerificationToken: string | null;
  emailVerificationExpires: Date | null;
  trustScore: number;
  lastTrustScoreUpdate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date | null;
  preferredChannel: string | null;
  languagePreference: string | null;
  timezone: string | null;
  contactHours: any | null; // JsonValue
  referralCode: string | null;
  referredById: string | null;
}

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  permissions: string[];
  usageCount: number;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export enum TokenType {
  ACCESS = 'ACCESS',
  REFRESH = 'REFRESH',
}

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  AGENT = 'AGENT',
}

export enum PropertyStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  UNDER_CONTRACT = 'UNDER_CONTRACT',
  SOLD = 'SOLD',
  RENTED = 'RENTED',
  ARCHIVED = 'ARCHIVED',
}

export enum TransactionType {
  SALE = 'SALE',
  PURCHASE = 'PURCHASE',
  TRANSFER = 'TRANSFER',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum FraudSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum FraudStatus {
  OPEN = 'OPEN',
  INVESTIGATING = 'INVESTIGATING',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}

export enum FraudPattern {
  EXCESSIVE_FAILED_LOGINS = 'EXCESSIVE_FAILED_LOGINS',
  SHARED_IP_MULTIPLE_ACCOUNTS = 'SHARED_IP_MULTIPLE_ACCOUNTS',
  MULTIPLE_IPS_FOR_ACCOUNT = 'MULTIPLE_IPS_FOR_ACCOUNT',
  NEW_DEVICE_LOGIN = 'NEW_DEVICE_LOGIN',
  TOKEN_REUSE = 'TOKEN_REUSE',
  RAPID_PROPERTY_LISTINGS = 'RAPID_PROPERTY_LISTINGS',
  DUPLICATE_PROPERTY_ADDRESS = 'DUPLICATE_PROPERTY_ADDRESS',
  HIGH_VALUE_NEW_ACCOUNT_LISTING = 'HIGH_VALUE_NEW_ACCOUNT_LISTING',
}

export enum DisputeStatus {
  OPEN = 'OPEN',
  UNDER_REVIEW = 'UNDER_REVIEW',
  RESOLVED = 'RESOLVED',
  CANCELLED = 'CANCELLED',
}

export enum MilestoneStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  DELAYED = 'DELAYED',
}

export namespace Prisma {
  export interface PropertyWhereInput extends Record<string, any> {}
  export interface PropertyOrderByWithRelationInput extends Record<string, any> {}
  export interface TransactionClient extends Record<string, any> {}
}
