import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NotificationsService } from './notifications.service';

export enum InspectionStatus {
  SCHEDULED = 'SCHEDULED',
  RESCHEDULED = 'RESCHEDULED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

export interface InspectionSlot {
  start: Date;
  end: Date;
  inspectorId: string;
}

export interface Inspection {
  id: string;
  propertyId: string;
  inspectorId: string;
  start: Date;
  end: Date;
  status: InspectionStatus;
  requestedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GenerateSlotsOptions {
  inspectorId: string;
  from: Date;
  to: Date;
  slotDurationMinutes?: number;
  workDayStartHour?: number;
  workDayEndHour?: number;
}

export interface BookInspectionInput {
  propertyId: string;
  inspectorId: string;
  start: Date;
  end: Date;
  requestedBy: string;
}

const DEFAULT_SLOT_DURATION_MINUTES = 60;
const DEFAULT_WORK_DAY_START_HOUR = 9;
const DEFAULT_WORK_DAY_END_HOUR = 17;

@Injectable()
export class InspectionSchedulingService {
  private readonly inspections = new Map<string, Inspection>();
  private readonly unavailability = new Map<string, InspectionSlot[]>();

  constructor(private readonly notificationsService: NotificationsService) {}

  generateAvailableSlots(options: GenerateSlotsOptions): InspectionSlot[] {
    const {
      inspectorId,
      from,
      to,
      slotDurationMinutes = DEFAULT_SLOT_DURATION_MINUTES,
      workDayStartHour = DEFAULT_WORK_DAY_START_HOUR,
      workDayEndHour = DEFAULT_WORK_DAY_END_HOUR,
    } = options;

    if (to <= from) {
      throw new BadRequestException('"to" date must be after "from" date');
    }

    const slots: InspectionSlot[] = [];
    const cursorDay = new Date(from);
    cursorDay.setHours(0, 0, 0, 0);

    while (cursorDay <= to) {
      let slotStart = new Date(cursorDay);
      slotStart.setHours(workDayStartHour, 0, 0, 0);
      const dayEnd = new Date(cursorDay);
      dayEnd.setHours(workDayEndHour, 0, 0, 0);

      while (slotStart < dayEnd) {
        const slotEnd = new Date(slotStart.getTime() + slotDurationMinutes * 60 * 1000);
        if (slotEnd <= dayEnd && slotStart >= from && slotEnd <= to) {
          const candidate: InspectionSlot = { start: slotStart, end: slotEnd, inspectorId };
          if (this.isInspectorAvailable(inspectorId, candidate.start, candidate.end)) {
            slots.push(candidate);
          }
        }
        slotStart = slotEnd;
      }

      cursorDay.setDate(cursorDay.getDate() + 1);
    }

    return slots;
  }

  isInspectorAvailable(inspectorId: string, start: Date, end: Date, excludeId?: string): boolean {
    const hasBookingConflict = Array.from(this.inspections.values()).some(
      (inspection) =>
        inspection.id !== excludeId &&
        inspection.inspectorId === inspectorId &&
        inspection.status !== InspectionStatus.CANCELLED &&
        this.overlaps(inspection.start, inspection.end, start, end),
    );
    if (hasBookingConflict) {
      return false;
    }

    const blockedSlots = this.unavailability.get(inspectorId) ?? [];
    return !blockedSlots.some((slot) => this.overlaps(slot.start, slot.end, start, end));
  }

  book(input: BookInspectionInput): Inspection {
    if (input.end <= input.start) {
      throw new BadRequestException('Inspection end time must be after the start time');
    }

    if (!this.isInspectorAvailable(input.inspectorId, input.start, input.end)) {
      throw new BadRequestException('Inspector is not available for the requested time slot');
    }

    const now = new Date();
    const inspection: Inspection = {
      id: randomUUID(),
      propertyId: input.propertyId,
      inspectorId: input.inspectorId,
      start: input.start,
      end: input.end,
      status: InspectionStatus.SCHEDULED,
      requestedBy: input.requestedBy,
      createdAt: now,
      updatedAt: now,
    };

    this.inspections.set(inspection.id, inspection);
    this.notificationsService.notify({
      event: 'inspection.scheduled',
      recipientId: input.requestedBy,
      data: { inspectionId: inspection.id, propertyId: inspection.propertyId },
    });

    return { ...inspection };
  }

  reschedule(id: string, start: Date, end: Date): Inspection {
    const inspection = this.getRecord(id);

    if (inspection.status === InspectionStatus.CANCELLED) {
      throw new BadRequestException('Cannot reschedule a cancelled inspection');
    }
    if (end <= start) {
      throw new BadRequestException('Inspection end time must be after the start time');
    }
    if (!this.isInspectorAvailable(inspection.inspectorId, start, end, inspection.id)) {
      throw new BadRequestException('Inspector is not available for the requested time slot');
    }

    inspection.start = start;
    inspection.end = end;
    inspection.status = InspectionStatus.RESCHEDULED;
    inspection.updatedAt = new Date();

    this.notificationsService.notify({
      event: 'inspection.rescheduled',
      recipientId: inspection.requestedBy,
      data: { inspectionId: inspection.id, propertyId: inspection.propertyId },
    });

    return { ...inspection };
  }

  cancel(id: string): Inspection {
    const inspection = this.getRecord(id);
    if (inspection.status === InspectionStatus.CANCELLED) {
      return { ...inspection };
    }

    inspection.status = InspectionStatus.CANCELLED;
    inspection.updatedAt = new Date();

    this.notificationsService.notify({
      event: 'inspection.cancelled',
      recipientId: inspection.requestedBy,
      data: { inspectionId: inspection.id, propertyId: inspection.propertyId },
    });

    return { ...inspection };
  }

  findOne(id: string): Inspection {
    return { ...this.getRecord(id) };
  }

  blockInspectorTime(inspectorId: string, start: Date, end: Date): void {
    const slots = this.unavailability.get(inspectorId) ?? [];
    slots.push({ inspectorId, start, end });
    this.unavailability.set(inspectorId, slots);
  }

  private overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
    return aStart < bEnd && bStart < aEnd;
  }

  private getRecord(id: string): Inspection {
    const inspection = this.inspections.get(id);
    if (!inspection) {
      throw new NotFoundException(`Inspection ${id} not found`);
    }
    return inspection;
  }
}
