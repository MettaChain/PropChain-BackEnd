// @ts-nocheck

import { registerEnumType } from '@nestjs/graphql';
import {
  UserRole,
  PropertyStatus,
  TransactionType,
  TransactionStatus,
  DocumentType,
  VerificationStatus,
  FraudSeverity,
  FraudStatus,
  FraudPattern,
  DisputeStatus,
  MilestoneStatus,
} from '@prisma/client';

// ============================================================================
// Prisma enum GraphQL registrations (existing)
// ============================================================================

registerEnumType(UserRole, { name: 'UserRole' });
registerEnumType(PropertyStatus, { name: 'PropertyStatus' });
registerEnumType(TransactionType, { name: 'TransactionType' });
registerEnumType(TransactionStatus, { name: 'TransactionStatus' });
registerEnumType(DocumentType, { name: 'DocumentType' });
registerEnumType(VerificationStatus, { name: 'VerificationStatus' });
registerEnumType(FraudSeverity, { name: 'FraudSeverity' });
registerEnumType(FraudStatus, { name: 'FraudStatus' });
registerEnumType(FraudPattern, { name: 'FraudPattern' });
registerEnumType(DisputeStatus, { name: 'DisputeStatus' });
registerEnumType(MilestoneStatus, { name: 'MilestoneStatus' });

// ============================================================================
// Centralized DTO enums — moved from properties/dto/ and transactions/dto/
// ============================================================================

/**
 * Property status values for DTO validation.
 * Centralized from src/properties/dto/property.dto.ts (#770)
 */
export const PROPERTY_STATUS_ENUM = [
  'DRAFT',
  'PENDING',
  'ACTIVE',
  'UNDER_CONTRACT',
  'SOLD',
  'RENTED',
  'ARCHIVED',
  'EXPIRED',
] as const;

export type PropertyStatusLiteral = (typeof PROPERTY_STATUS_ENUM)[number];

/**
 * Transaction type values for DTO validation.
 * Centralized from src/transactions/dto/transaction.dto.ts (#770)
 */
export enum TransactionTypeDto {
  SALE = 'SALE',
  PURCHASE = 'PURCHASE',
  TRANSFER = 'TRANSFER',
}

/**
 * Transaction status values for DTO validation.
 * Centralized from src/transactions/dto/transaction.dto.ts (#770)
 */
export enum TransactionStatusDto {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}

// ============================================================================
// Re-exports of Prisma enums (existing)
// ============================================================================

export {
  UserRole,
  PropertyStatus,
  TransactionType,
  TransactionStatus,
  DocumentType,
  VerificationStatus,
  FraudSeverity,
  FraudStatus,
  FraudPattern,
  DisputeStatus,
  MilestoneStatus,
};
