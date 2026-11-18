import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NotificationsService } from '../../src/notifications/notifications.service';

export enum MaintenanceRequestStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum MaintenanceRequestPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  EMERGENCY = 'EMERGENCY',
}

export interface CreateMaintenanceRequestInput {
  propertyId: string;
  requestedBy: string;
  title: string;
  description: string;
  priority: MaintenanceRequestPriority;
}

export interface MaintenanceCostEntry {
  amount: number;
  notes?: string;
  recordedAt: Date;
}

export interface MaintenanceRequestRecord {
  id: string;
  propertyId: string;
  requestedBy: string;
  title: string;
  description: string;
  priority: MaintenanceRequestPriority;
  status: MaintenanceRequestStatus;
  assignedTo?: string;
  costs: MaintenanceCostEntry[];
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  closedAt?: Date;
}

const TRANSITIONS: Record<MaintenanceRequestStatus, MaintenanceRequestStatus[]> = {
  [MaintenanceRequestStatus.OPEN]: [
    MaintenanceRequestStatus.IN_PROGRESS,
    MaintenanceRequestStatus.CLOSED,
  ],
  [MaintenanceRequestStatus.IN_PROGRESS]: [
    MaintenanceRequestStatus.RESOLVED,
    MaintenanceRequestStatus.OPEN,
  ],
  [MaintenanceRequestStatus.RESOLVED]: [
    MaintenanceRequestStatus.CLOSED,
    MaintenanceRequestStatus.IN_PROGRESS,
  ],
  [MaintenanceRequestStatus.CLOSED]: [],
};

@Injectable()
export class MaintenanceRequestService {
  private readonly logger = new Logger(MaintenanceRequestService.name);
  private readonly requests = new Map<string, MaintenanceRequestRecord>();

  constructor(
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {}

  async create(input: CreateMaintenanceRequestInput): Promise<MaintenanceRequestRecord> {
    const now = new Date();
    const request: MaintenanceRequestRecord = {
      id: randomUUID(),
      propertyId: input.propertyId,
      requestedBy: input.requestedBy,
      title: input.title.trim(),
      description: input.description.trim(),
      priority: input.priority,
      status: MaintenanceRequestStatus.OPEN,
      costs: [],
      createdAt: now,
      updatedAt: now,
    };

    this.requests.set(request.id, request);
    await this.notifyPriority(request);
    return this.clone(request);
  }

  findAll(filters?: {
    propertyId?: string;
    status?: MaintenanceRequestStatus;
    priority?: MaintenanceRequestPriority;
    assignedTo?: string;
  }): MaintenanceRequestRecord[] {
    return Array.from(this.requests.values())
      .filter((request) => !filters?.propertyId || request.propertyId === filters.propertyId)
      .filter((request) => !filters?.status || request.status === filters.status)
      .filter((request) => !filters?.priority || request.priority === filters.priority)
      .filter((request) => !filters?.assignedTo || request.assignedTo === filters.assignedTo)
      .map((request) => this.clone(request));
  }

  findOne(id: string): MaintenanceRequestRecord {
    return this.clone(this.getRecord(id));
  }

  async transition(
    id: string,
    status: MaintenanceRequestStatus,
  ): Promise<MaintenanceRequestRecord> {
    const request = this.getRecord(id);
    if (!TRANSITIONS[request.status].includes(status)) {
      throw new BadRequestException(
        `Cannot transition maintenance request from ${request.status} to ${status}`,
      );
    }

    request.status = status;
    request.updatedAt = new Date();
    if (status === MaintenanceRequestStatus.RESOLVED) request.resolvedAt = new Date();
    if (status === MaintenanceRequestStatus.CLOSED) request.closedAt = new Date();

    await this.notifyPriority(request);
    return this.clone(request);
  }

  async assignTechnician(id: string, technicianId: string): Promise<MaintenanceRequestRecord> {
    const request = this.getRecord(id);
    request.assignedTo = technicianId;
    request.updatedAt = new Date();

    await this.notify(
      technicianId,
      'Maintenance request assigned',
      `You have been assigned to "${request.title}" (${request.priority}).`,
      request.id,
    );
    return this.clone(request);
  }

  addCost(id: string, amount: number, notes?: string): MaintenanceRequestRecord {
    if (amount < 0) throw new BadRequestException('Maintenance cost cannot be negative');
    const request = this.getRecord(id);
    request.costs.push({ amount, notes, recordedAt: new Date() });
    request.updatedAt = new Date();
    return this.clone(request);
  }

  getCostSummary(id: string): { requestId: string; totalCost: number; entries: number } {
    const request = this.getRecord(id);
    return {
      requestId: request.id,
      totalCost: Number(request.costs.reduce((sum, cost) => sum + cost.amount, 0).toFixed(2)),
      entries: request.costs.length,
    };
  }

  getHistory(propertyId: string): MaintenanceRequestRecord[] {
    return Array.from(this.requests.values())
      .filter((request) => request.propertyId === propertyId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((request) => this.clone(request));
  }

  getAvailableTechnicians(technicians: string[], activeAssignments: Record<string, number>) {
    return technicians.filter((technician) => (activeAssignments[technician] ?? 0) < 3);
  }

  private getRecord(id: string): MaintenanceRequestRecord {
    const request = this.requests.get(id);
    if (!request) throw new NotFoundException(`Maintenance request ${id} not found`);
    return request;
  }

  private async notifyPriority(request: MaintenanceRequestRecord): Promise<void> {
    if (
      request.priority !== MaintenanceRequestPriority.HIGH &&
      request.priority !== MaintenanceRequestPriority.EMERGENCY
    ) {
      return;
    }

    const recipient = request.assignedTo ?? request.requestedBy;
    await this.notify(
      recipient,
      `Priority maintenance request: ${request.priority}`,
      `${request.title} requires immediate attention.`,
      request.id,
    );
  }

  private async notify(
    userId: string,
    title: string,
    message: string,
    requestId: string,
  ): Promise<void> {
    if (!this.notificationsService) {
      this.logger.warn(`${title}: ${message}`);
      return;
    }

    try {
      await this.notificationsService.sendNotification(
        userId,
        title,
        message,
        'MAINTENANCE_REQUEST',
        { requestId },
      );
    } catch (error) {
      this.logger.error(
        `Failed to send maintenance notification for ${requestId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private clone(request: MaintenanceRequestRecord): MaintenanceRequestRecord {
    return { ...request, costs: request.costs.map((cost) => ({ ...cost })) };
  }
}
