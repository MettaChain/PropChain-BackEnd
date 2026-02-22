// Prisma model interfaces (will be replaced with actual Prisma types when available)
export interface PrismaUser {
  id: string;
  email: string;
  walletAddress?: string | null;
  role: string;
  roleId?: string | null;
  password?: string | null;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PrismaProperty {
  id: string;
  title: string;
  description?: string | null;
  location: string;
  price: any; // Will be Decimal when Prisma is available
  status: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  // Valuation fields
  estimatedValue?: any | null;
  valuationDate?: Date | null;
  valuationConfidence?: number | null;
  valuationSource?: string | null;
  lastValuationId?: string | null;
  // Property features
  bedrooms?: number | null;
  bathrooms?: number | null;
  squareFootage?: any | null;
  yearBuilt?: number | null;
  propertyType?: string | null;
  lotSize?: any | null;
}

export interface PrismaPropertyValuation {
  id: string;
  propertyId: string;
  estimatedValue: any; // Will be Decimal when Prisma is available
  confidenceScore: number;
  valuationDate: Date;
  source: string;
  marketTrend?: string | null;
  featuresUsed?: any | null; // Will be Json when Prisma is available
  rawData?: any | null; // Will be Json when Prisma is available
  createdAt: Date;
}

export interface PrismaTransaction {
  id: string;
  fromAddress: string;
  toAddress: string;
  amount: any; // Will be Decimal when Prisma is available
  txHash?: string | null;
  status: string;
  type: string;
  propertyId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PrismaRole {
  id: string;
  name: string;
  description?: string | null;
  level: number;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PrismaPermission {
  id: string;
  resource: string;
  action: string;
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PrismaDocument {
  id: string;
  name: string;
  type: string;
  status: string;
  fileUrl: string;
  fileHash?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  description?: string | null;
  propertyId?: string | null;
  transactionId?: string | null;
  uploadedById: string;
  verifiedAt?: Date | null;
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PrismaApiKey {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
  scopes: string[];
  requestCount: bigint;
  lastUsedAt?: Date | null;
  isActive: boolean;
  rateLimit?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// Prisma model types with relations
export type UserWithRelations = PrismaUser & {
  properties: PrismaProperty[];
  receivedTransactions: PrismaTransaction[];
  userRole: PrismaRole | null;
  roleChanges: any[];
  documents: PrismaDocument[];
};

export type PropertyWithRelations = PrismaProperty & {
  owner: PrismaUser;
  transactions: PrismaTransaction[];
  valuations: PrismaPropertyValuation[];
  documents: PrismaDocument[];
};

export type PropertyValuationWithRelations = PrismaPropertyValuation & {
  property: PrismaProperty;
};

export type TransactionWithRelations = PrismaTransaction & {
  property: PrismaProperty | null;
  recipient: PrismaUser | null;
  documents: PrismaDocument[];
};

export type DocumentWithRelations = PrismaDocument & {
  property: PrismaProperty | null;
  transaction: PrismaTransaction | null;
  uploadedBy: PrismaUser;
};

export type RoleWithRelations = PrismaRole & {
  users: PrismaUser[];
  permissions: (RolePermission & { permission: PrismaPermission })[];
  roleChangeLogs: any[];
};

export type RolePermission = {
  id: string;
  roleId: string;
  permissionId: string;
  createdAt: Date;
  role: PrismaRole;
  permission: PrismaPermission;
};

export type ApiKeyWithUsage = PrismaApiKey & {
  usageCount: number;
  lastUsedFormatted: string;
};

// Prisma query result types
export type PropertyListResult = {
  properties: PropertyWithRelations[];
  totalCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type ValuationHistoryResult = {
  valuations: PropertyValuationWithRelations[];
  averageValue: number;
  trend: 'up' | 'down' | 'stable';
};

export type DocumentListResult = {
  documents: DocumentWithRelations[];
  totalCount: number;
  hasNextPage: boolean;
};