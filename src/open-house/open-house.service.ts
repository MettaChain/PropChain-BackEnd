// @ts-nocheck

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateOpenHouseDto } from './dto/create-open-house.dto';
import { RsvpOpenHouseDto } from './dto/rsvp-open-house.dto';
import {
  CreateTourRequestDto,
  UpdateTourRequestStatusDto,
  CreateAgentAvailabilityDto,
} from './dto/tour-request.dto';
import { NotificationsService } from '../notifications/notifications.service';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class OpenHouseService {
  private readonly logger = new Logger(OpenHouseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(dto: CreateOpenHouseDto) {
    return this.prisma.openHouse.create({
      data: {
        propertyId: dto.propertyId,
        title: dto.title ?? 'Open House',
        description: dto.description,
        startAt: dto.startAt,
        endAt: dto.endAt,
      },
    });
  }

  async findOne(id: string) {
    const openHouse = await this.prisma.openHouse.findUnique({
      where: { id },
      include: { rsvps: true, property: true },
    });
    if (!openHouse) {
      throw new NotFoundException('Open house not found');
    }
    return openHouse;
  }

  async cancel(id: string) {
    return this.prisma.openHouse.update({
      where: { id },
      data: { isCancelled: true, cancelledAt: new Date() },
    });
  }

  async rsvp(openHouseId: string, dto: RsvpOpenHouseDto) {
    const openHouse = await this.prisma.openHouse.findUnique({
      where: { id: openHouseId },
      include: { property: { select: { title: true, address: true } } },
    });
    if (!openHouse) {
      throw new NotFoundException('Open house not found');
    }

    const rsvp = await this.prisma.openHouseRsvp.upsert({
      where: { openHouseId_userId: { openHouseId, userId: dto.userId } },
      update: { status: dto.status },
      create: {
        openHouseId,
        userId: dto.userId,
        status: dto.status,
      },
    });

    const title = `RSVP Confirmed: ${openHouse.title}`;
    const message = `Your RSVP status is ${dto.status} for "${openHouse.property.title}" at ${openHouse.property.address}.`;
    await this.notificationsService.sendNotification(
      dto.userId,
      title,
      message,
      'OPEN_HOUSE_RSVP',
      {
        openHouseId,
        status: dto.status,
        propertyTitle: openHouse.property.title,
        propertyAddress: openHouse.property.address,
        startAt: openHouse.startAt,
        endAt: openHouse.endAt,
      },
    );

    return rsvp;
  }

  // ─── Private Tour Requests ────────────────────────────────────────────────

  async createTourRequest(userId: string, dto: CreateTourRequestDto) {
    const property = await this.prisma.property.findUnique({
      where: { id: dto.propertyId },
    });
    if (!property) throw new NotFoundException('Property not found');

    const tourRequest = await this.prisma.tourRequest.create({
      data: {
        propertyId: dto.propertyId,
        requesterId: userId,
        agentId: dto.agentId,
        tourType: (dto.tourType || 'PRIVATE') as any,
        requestedAt: new Date(dto.requestedAt),
        notes: dto.notes,
        timezone: dto.timezone || 'UTC',
      },
      include: {
        property: true,
        requester: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    if (dto.agentId) {
      await this.notificationsService.sendNotification(
        dto.agentId,
        'New Tour Request',
        `You have a new tour request for "${property.title}" at ${property.address}.`,
        'TOUR_REQUEST',
        { tourRequestId: tourRequest.id, propertyId: dto.propertyId },
      );
    }

    return tourRequest;
  }

  async getTourRequest(id: string) {
    const tour = await this.prisma.tourRequest.findUnique({
      where: { id },
      include: {
        property: true,
        requester: { select: { id: true, firstName: true, lastName: true } },
        agent: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!tour) throw new NotFoundException('Tour request not found');
    return tour;
  }

  async updateTourStatus(id: string, dto: UpdateTourRequestStatusDto) {
    const tour = await this.prisma.tourRequest.findUnique({ where: { id } });
    if (!tour) throw new NotFoundException('Tour request not found');

    const data: any = { status: dto.status };
    if (dto.status === 'CONFIRMED') data.confirmedAt = new Date();

    const updated = await this.prisma.tourRequest.update({
      where: { id },
      data,
      include: { property: true },
    });

    await this.notificationsService.sendNotification(
      tour.requesterId,
      `Tour ${dto.status.toLowerCase()}`,
      `Your tour request for "${updated.property.title}" has been ${dto.status.toLowerCase()}.`,
      'TOUR_STATUS_UPDATE',
      { tourRequestId: id, status: dto.status },
    );

    return updated;
  }

  async getMyTourRequests(userId: string) {
    return this.prisma.tourRequest.findMany({
      where: { requesterId: userId },
      include: { property: { select: { id: true, title: true, address: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAgentTourRequests(agentId: string) {
    return this.prisma.tourRequest.findMany({
      where: { agentId },
      include: {
        property: { select: { id: true, title: true, address: true } },
        requester: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { requestedAt: 'asc' },
    });
  }

  // ─── Agent Availability ───────────────────────────────────────────────────

  async setAgentAvailability(agentId: string, dto: CreateAgentAvailabilityDto) {
    const existing = await this.prisma.agentAvailability.findFirst({
      where: { agentId, dayOfWeek: dto.dayOfWeek, startTime: dto.startTime },
    });

    if (existing) {
      return this.prisma.agentAvailability.update({
        where: { id: existing.id },
        data: {
          endTime: dto.endTime,
          isActive: dto.isActive ?? true,
        },
      });
    }

    return this.prisma.agentAvailability.create({
      data: {
        agentId,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async getAgentAvailability(agentId: string) {
    return this.prisma.agentAvailability.findMany({
      where: { agentId, isActive: true },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async removeAgentAvailability(id: string) {
    await this.prisma.agentAvailability.delete({ where: { id } });
    return { deleted: true };
  }

  // ─── iCal Export ──────────────────────────────────────────────────────────

  async exportTourICal(userId: string) {
    const tours = await this.prisma.tourRequest.findMany({
      where: {
        OR: [{ requesterId: userId }, { agentId: userId }],
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      include: { property: true },
    });

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//PropChain//Tour Scheduling//EN',
      'CALSCALE:GREGORIAN',
    ];

    for (const tour of tours) {
      const dtStart = tour.requestedAt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      const dtEnd =
        new Date(tour.requestedAt.getTime() + 60 * 60 * 1000)
          .toISOString()
          .replace(/[-:]/g, '')
          .split('.')[0] + 'Z';
      lines.push(
        'BEGIN:VEVENT',
        `UID:${tour.id}@propchain`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:Property Tour - ${tour.property.title}`,
        `LOCATION:${tour.property.address}`,
        `DESCRIPTION:${tour.notes || 'Property tour'}`,
        `STATUS:${tour.status}`,
        'END:VEVENT',
      );
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  // ─── Tour Reminders ───────────────────────────────────────────────────────

  @Cron('0 * * * *')
  async send24hTourReminders() {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const windowStart = new Date(in24h.getTime() - 30 * 60 * 1000);
    const windowEnd = new Date(in24h.getTime() + 30 * 60 * 1000);

    const tours = await this.prisma.tourRequest.findMany({
      where: {
        status: 'CONFIRMED',
        requestedAt: { gte: windowStart, lte: windowEnd },
      },
      include: { property: true },
    });

    for (const tour of tours) {
      await this.notificationsService.sendNotification(
        tour.requesterId,
        'Tour Reminder (24h)',
        `Reminder: Your tour for "${tour.property.title}" is tomorrow.`,
        'TOUR_REMINDER_24H',
        { tourRequestId: tour.id },
      );
      if (tour.agentId) {
        await this.notificationsService.sendNotification(
          tour.agentId,
          'Tour Reminder (24h)',
          `Reminder: You have a tour for "${tour.property.title}" tomorrow.`,
          'TOUR_REMINDER_24H',
          { tourRequestId: tour.id },
        );
      }
    }
  }

  @Cron('0 * * * *')
  async send1hTourReminders() {
    const now = new Date();
    const in1h = new Date(now.getTime() + 60 * 60 * 1000);
    const windowStart = new Date(in1h.getTime() - 15 * 60 * 1000);
    const windowEnd = new Date(in1h.getTime() + 15 * 60 * 1000);

    const tours = await this.prisma.tourRequest.findMany({
      where: {
        status: 'CONFIRMED',
        requestedAt: { gte: windowStart, lte: windowEnd },
      },
      include: { property: true },
    });

    for (const tour of tours) {
      await this.notificationsService.sendNotification(
        tour.requesterId,
        'Tour Reminder (1h)',
        `Reminder: Your tour for "${tour.property.title}" is in 1 hour!`,
        'TOUR_REMINDER_1H',
        { tourRequestId: tour.id },
      );
      if (tour.agentId) {
        await this.notificationsService.sendNotification(
          tour.agentId,
          'Tour Reminder (1h)',
          `Reminder: You have a tour for "${tour.property.title}" in 1 hour!`,
          'TOUR_REMINDER_1H',
          { tourRequestId: tour.id },
        );
      }
    }
  }
}
