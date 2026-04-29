import { registerEnumType } from '@nestjs/graphql';
import {
  UserRole,
  PropertyStatus,
  TransactionType,
  TransactionStatus,
  DocumentType,
  VerificationStatus,
} from '@prisma/client';

registerEnumType(UserRole, { name: 'UserRole' });
registerEnumType(PropertyStatus, { name: 'PropertyStatus' });
registerEnumType(TransactionType, { name: 'TransactionType' });
registerEnumType(TransactionStatus, { name: 'TransactionStatus' });
registerEnumType(DocumentType, { name: 'DocumentType' });
registerEnumType(VerificationStatus, { name: 'VerificationStatus' });

export {
  UserRole,
  PropertyStatus,
  TransactionType,
  TransactionStatus,
  DocumentType,
  VerificationStatus,
};
