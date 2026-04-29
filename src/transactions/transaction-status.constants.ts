import { TransactionStatus } from '../types/prisma.types';

export const DEFAULT_TRANSACTION_STATUS = TransactionStatus.PENDING;

const ALLOWED_TRANSACTION_STATUS_TRANSITIONS: Record<TransactionStatus, readonly TransactionStatus[]> = {
  [TransactionStatus.PENDING]: [TransactionStatus.COMPLETED, TransactionStatus.CANCELLED],
  [TransactionStatus.COMPLETED]: [],
  [TransactionStatus.CANCELLED]: [],
};

export function canTransitionTransactionStatus(
  currentStatus: TransactionStatus,
  nextStatus: TransactionStatus,
): boolean {
  if (currentStatus === nextStatus) {
    return true;
  }

  return ALLOWED_TRANSACTION_STATUS_TRANSITIONS[currentStatus].includes(nextStatus);
}
