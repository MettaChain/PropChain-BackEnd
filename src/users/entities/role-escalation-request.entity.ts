import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum RoleEscalationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('role_escalation_requests')
export class RoleEscalationRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  currentRole: string;

  @Column()
  requestedRole: string;

  @Column({
    type: 'enum',
    enum: RoleEscalationStatus,
    default: RoleEscalationStatus.PENDING,
  })
  status: RoleEscalationStatus;

  @Column({ nullable: true })
  reviewedBy: string | null;

  @Column({ nullable: true })
  reviewComment: string | null;

  @Column({ nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}