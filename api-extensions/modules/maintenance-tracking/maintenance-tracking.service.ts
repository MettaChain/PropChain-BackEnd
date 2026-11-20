import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NotificationsService } from '../../services/notifications.service';
import {
  CreateMaintenanceRequestDto,
  MaintenanceCostDto,
  MaintenancePriority,
  MaintenanceQueryDto,
  MaintenanceRequestResponseDto,
  MaintenanceStatus,
  UpdateMaintenanceRequestDto,
} from './dto/maintenance-request.dto';

interface MaintenanceNote {
  message: string;
  createdAt: Date;
}

interface MaintenanceRequestRecord extends MaintenanceRequestResponseDto {
  notes: MaintenanceNote[];
  statusHistory: Array<{ status: MaintenanceStatus; changedAt: Date }>;
}

const ALLOWED_TRANSITIONS: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  [MaintenanceStatus.OPEN]: [MaintenanceStatus.IN_PROGRESS, MaintenanceStatus.CLOSED],
  [MaintenanceStatus.IN_PROGRESS]: [MaintenanceStatus.RESOLVED, MaintenanceStatus.OPEN],
  [MaintenanceStatus.RESOLVED]: [MaintenanceStatus.CLOSED, MaintenanceStatus.IN_PROGRESS],
  [MaintenanceStatus.CLOSED]: [],
};

@Injectable()
export class MaintenanceTrackingService {
  private readonly requests = new Map<string, MaintenanceRequestRecord>();

  constructor(private readonly notificationsService: NotificationsService) {}

  create(dto: CreateMaintenanceRequestDto): MaintenanceRequestResponseDto {
    const now = new Date();
    const request: MaintenanceRequestRecord = {
      id: randomUUID(),
      propertyId: dto.propertyId,
      title: dto.title.trim(),
      description: dto.description.trim(),
      status: MaintenanceStatus.OPEN,
      priority: dto.priority,
      dueDate: dto.dueDate,
      totalCost: 0,
      costs: [],
      notes: [],
      statusHistory: [{ status: MaintenanceStatus.OPEN, changedAt: now }],
      createdAt: now,
      updatedAt: now,
    };

    this.requests.set(request.id, request);

    if (request.priority === MaintenancePriority.EMERGENCY) {
      this.notificationsService.notify({
        event: 'maintenance.emergency',
        recipientId: request.propertyId,
        data: { requestId: request.id, propertyId: request.propertyId, title: request.title },
      });
    }

    return this.toResponse(request);
  }

  findAll(query: MaintenanceQueryDto): MaintenanceRequestResponseDto[] {
    return Array.from(this.requests.values())
      .filter((request) => !query.propertyId || request.propertyId === query.propertyId)
      .filter((request) => !query.status || request.status === query.status)
      .filter((request) => !query.priority || request.priority === query.priority)
      .filter((request) => !query.assignedTo || request.assignedTo === query.assignedTo)
      .map((request) => this.toResponse(request));
  }

  findOne(id: string): MaintenanceRequestResponseDto {
    return this.toResponse(this.getRecord(id));
  }

  update(id: string, dto: UpdateMaintenanceRequestDto): MaintenanceRequestResponseDto {
    const request = this.getRecord(id);

    if (dto.status) {
      this.assertTransitionAllowed(request.status, dto.status);
      request.status = dto.status;
      request.statusHistory.push({ status: dto.status, changedAt: new Date() });
      if (dto.status === MaintenanceStatus.RESOLVED) {
        request.resolvedAt = new Date();
      }
      if (dto.status === MaintenanceStatus.CLOSED) {
        request.closedAt = new Date();
      }
    }

    if (dto.assignedTo !== undefined) request.assignedTo = dto.assignedTo;
    if (dto.scheduledDate !== undefined) request.scheduledDate = dto.scheduledDate;
    if (dto.notes) request.notes.push({ message: dto.notes.trim(), createdAt: new Date() });
    if (dto.cost !== undefined) {
      const cost: MaintenanceCostDto = {
        amount: dto.cost,
        recordedAt: new Date(),
        notes: dto.notes,
      };
      request.costs.push(cost);
      request.totalCost = Number((request.totalCost + dto.cost).toFixed(2));
    }

    request.updatedAt = new Date();
    return this.toResponse(request);
  }

  getHistory(propertyId: string): MaintenanceRequestResponseDto[] {
    return Array.from(this.requests.values())
      .filter((request) => request.propertyId === propertyId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((request) => this.toResponse(request));
  }

  getSummary(propertyId: string) {
    const requests = Array.from(this.requests.values()).filter(
      (request) => request.propertyId === propertyId,
    );
    const counts = Object.values(MaintenanceStatus).reduce<Record<string, number>>(
      (acc, status) => ({ ...acc, [status]: 0 }),
      {},
    );

    for (const request of requests) {
      counts[request.status] += 1;
    }

    return {
      propertyId,
      totalRequests: requests.length,
      openRequests: requests.filter((request) => request.status === MaintenanceStatus.OPEN).length,
      totalCost: Number(
        requests.reduce((sum, request) => sum + request.totalCost, 0).toFixed(2),
      ),
      byStatus: counts,
      byPriority: requests.reduce<Record<string, number>>((acc, request) => {
        acc[request.priority] = (acc[request.priority] ?? 0) + 1;
        return acc;
      }, {}),
    };
  }

  private getRecord(id: string): MaintenanceRequestRecord {
    const request = this.requests.get(id);
    if (!request) throw new NotFoundException(`Maintenance request ${id} not found`);
    return request;
  }

  private assertTransitionAllowed(from: MaintenanceStatus, to: MaintenanceStatus): void {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new BadRequestException(
        `Cannot transition maintenance request from ${from} to ${to}`,
      );
    }
  }

  private toResponse(request: MaintenanceRequestRecord): MaintenanceRequestResponseDto {
    const { notes, statusHistory, ...response } = request;
    void notes;
    void statusHistory;
    return { ...response, costs: [...response.costs] };
  }
}
