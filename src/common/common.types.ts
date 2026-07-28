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

export enum TransactionTypeDto {
  SALE = 'SALE',
  PURCHASE = 'PURCHASE',
  TRANSFER = 'TRANSFER',
}

export enum TransactionStatusDto {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}

export enum PropertyStatusDto {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  UNDER_CONTRACT = 'UNDER_CONTRACT',
  SOLD = 'SOLD',
  RENTED = 'RENTED',
  ARCHIVED = 'ARCHIVED',
  EXPIRED = 'EXPIRED',
}
