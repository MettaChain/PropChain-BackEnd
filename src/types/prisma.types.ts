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

export namespace Prisma {
  export interface PropertyWhereInput extends Record<string, any> {}
  export interface PropertyOrderByWithRelationInput extends Record<string, any> {}
  export interface TransactionClient extends Record<string, any> {}
}
