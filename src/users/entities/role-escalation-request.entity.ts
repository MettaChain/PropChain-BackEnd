// NOTE: This project persists data via Prisma, not TypeORM. This file was a
// leftover TypeORM entity (the `typeorm` package is not a dependency), so it is
// expressed as a plain class to describe the role-escalation-request shape
// without pulling in an uninstalled ORM.

export enum RoleEscalationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export class RoleEscalationRequest {
  id!: string;
  userId!: string;
  currentRole!: string;
  requestedRole!: string;
  status: RoleEscalationStatus = RoleEscalationStatus.PENDING;
  reviewedBy: string | null = null;
  reviewComment: string | null = null;
  reviewedAt: Date | null = null;
  createdAt!: Date;
}
