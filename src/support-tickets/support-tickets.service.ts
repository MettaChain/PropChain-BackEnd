// @ts-nocheck

import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  CreateSupportTicketDto,
  UpdateTicketStatusDto,
  AssignTicketDto,
  AddTicketNoteDto,
} from './dto/support-ticket.dto';

const SLA_HOURS: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 8,
  MEDIUM: 24,
  LOW: 72,
};

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  NEW: ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED'],
  WAITING_ON_CUSTOMER: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: ['IN_PROGRESS'],
};

@Injectable()
export class SupportTicketsService {
  private readonly logger = new Logger(SupportTicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createTicket(userId: string, dto: CreateSupportTicketDto) {
    const priority = dto.priority || 'MEDIUM';
    const slaHours = SLA_HOURS[priority] || SLA_HOURS.MEDIUM;
    const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId,
        category: (dto.category || 'GENERAL') as any,
        priority: priority as any,
        subject: dto.subject,
        description: dto.description,
        transactionId: dto.transactionId,
        propertyId: dto.propertyId,
        slaDeadline,
      },
    });

    this.logger.log(
      `Support ticket created: ${ticket.id} (priority: ${priority}, SLA: ${slaDeadline.toISOString()})`,
    );
    return ticket;
  }

  async getTicket(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        notes: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Support ticket not found');
    return ticket;
  }

  async updateStatus(id: string, dto: UpdateTicketStatusDto, actorId?: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Support ticket not found');

    const allowed = VALID_STATUS_TRANSITIONS[ticket.status] || [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${ticket.status} to ${dto.status}. Allowed: ${allowed.join(', ')}`,
      );
    }

    const data: any = { status: dto.status as any };
    if (dto.status === 'RESOLVED') data.resolvedAt = new Date();
    if (dto.status === 'CLOSED') data.closedAt = new Date();
    if (dto.status === 'IN_PROGRESS' && !ticket.firstResponseAt) {
      data.firstResponseAt = new Date();
    }

    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data,
      include: { user: { select: { id: true, firstName: true, email: true } } },
    });

    // Notify user of status change
    if (updated.userId) {
      await this.notificationsService.sendNotification(
        updated.userId,
        `Ticket Status Updated`,
        `Your ticket "${updated.subject}" is now ${dto.status}.`,
        'SUPPORT_TICKET_UPDATE',
        { ticketId: id, status: dto.status },
      );
    }

    if (actorId && dto.notes) {
      await this.addNote(id, { content: dto.notes, isPublic: true }, actorId);
    }

    return updated;
  }

  async assignTicket(id: string, dto: AssignTicketDto) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Support ticket not found');

    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: {
        assignedToId: dto.agentId,
        status: ticket.status === 'NEW' ? 'IN_PROGRESS' : ticket.status,
        ...(ticket.status === 'NEW' && { firstResponseAt: new Date() }),
      },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await this.notificationsService.sendNotification(
      dto.agentId,
      'Ticket Assigned',
      `You have been assigned ticket "${ticket.subject}".`,
      'SUPPORT_TICKET_ASSIGNED',
      { ticketId: id, priority: ticket.priority },
    );

    return updated;
  }

  async addNote(id: string, dto: AddTicketNoteDto, authorId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Support ticket not found');

    // Update first response time if not yet set
    if (!ticket.firstResponseAt) {
      await this.prisma.supportTicket.update({
        where: { id },
        data: { firstResponseAt: new Date() },
      });
    }

    return this.prisma.supportTicketNote.create({
      data: {
        ticketId: id,
        authorId,
        content: dto.content,
        isPublic: dto.isPublic ?? true,
      },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async listTickets(filters: {
    userId?: string;
    assignedToId?: string;
    status?: string;
    priority?: string;
    category?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.assignedToId) where.assignedToId = filters.assignedToId;
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.category) where.category = filters.category;

    const [tickets, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return {
      tickets,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUnassignedTickets() {
    return this.prisma.supportTicket.findMany({
      where: { assignedToId: null, status: 'NEW' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getTicketMetrics(agentId?: string) {
    const where: any = {};
    if (agentId) where.assignedToId = agentId;

    const [total, open, resolved, breached] = await Promise.all([
      this.prisma.supportTicket.count({ where }),
      this.prisma.supportTicket.count({
        where: { ...where, status: { in: ['NEW', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER'] } },
      }),
      this.prisma.supportTicket.count({
        where: { ...where, status: { in: ['RESOLVED', 'CLOSED'] } },
      }),
      this.prisma.supportTicket.count({
        where: { ...where, slaBreached: true },
      }),
    ]);

    return { total, open, resolved, breached };
  }

  // ─── SLA Monitoring ──────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkSlaBreaches() {
    const now = new Date();
    const breachedTickets = await this.prisma.supportTicket.findMany({
      where: {
        slaBreached: false,
        status: { in: ['NEW', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER'] },
        slaDeadline: { lt: now },
      },
      include: { user: { select: { id: true, firstName: true, email: true } } },
    });

    for (const ticket of breachedTickets) {
      await this.prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { slaBreached: true },
      });

      this.logger.warn(`SLA breached for ticket ${ticket.id} (priority: ${ticket.priority})`);

      // Notify assigned agent
      if (ticket.assignedToId) {
        await this.notificationsService.sendNotification(
          ticket.assignedToId,
          'SLA Breach Alert',
          `Ticket "${ticket.subject}" has breached its SLA deadline.`,
          'SUPPORT_TICKET_SLA_BREACH',
          { ticketId: ticket.id, priority: ticket.priority, slaDeadline: ticket.slaDeadline },
        );
      }
    }
  }

  async getSlaInfo(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Support ticket not found');

    if (!ticket.slaDeadline) {
      return { deadline: null, breached: ticket.slaBreached, timeRemaining: null };
    }

    const now = new Date();
    const diffMs = ticket.slaDeadline.getTime() - now.getTime();
    const breached = diffMs < 0 || ticket.slaBreached;

    let timeRemaining: string | null = null;
    if (!breached) {
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      timeRemaining = `${hours}h ${minutes}m`;
    }

    return { deadline: ticket.slaDeadline, breached, timeRemaining };
  }
}
