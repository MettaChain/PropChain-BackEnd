export interface UserData {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  isVerified: boolean;
  twoFactorEnabled: boolean;
  avatar: string | null;
  createdAt: Date;
  updatedAt: Date;
  properties: PropertyData[];
  buyerTransactions: TransactionData[];
  sellerTransactions: TransactionData[];
  apiKeys: ApiKeyData[];
  passwordHistory: PasswordHistoryData[];
}

export interface PropertyData {
  id: string;
  status: string;
}

export interface TransactionData {
  id: string;
  status: string;
}

export interface ApiKeyData {
  id: string;
  revokedAt: Date | null;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
}

export interface PasswordHistoryData {
  id: string;
  createdAt: Date;
}
