import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class SupportTicketsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertTicketExists(ticketId: string) {
    const tx = await this.prisma.transaction.findUnique({ where: { id: ticketId } });
    if (!tx) throw new NotFoundException('Support ticket not found');
  }

  async addInternalNote(ticketId: string, authorId: string, content: string) {
    await this.assertTicketExists(ticketId);
    return (this.prisma as any).transactionNote.create({
      data: { transactionId: ticketId, authorId, content, isPublic: false },
    });
  }

  async addPublicReply(ticketId: string, authorId: string, content: string) {
    await this.assertTicketExists(ticketId);
    return (this.prisma as any).transactionNote.create({
      data: { transactionId: ticketId, authorId, content, isPublic: true },
    });
  }

  async listForAgent(ticketId: string) {
    await this.assertTicketExists(ticketId);
    return (this.prisma as any).transactionNote.findMany({
      where: { transactionId: ticketId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listPublicForUser(ticketId: string) {
    await this.assertTicketExists(ticketId);
    return (this.prisma as any).transactionNote.findMany({
      where: { transactionId: ticketId, isPublic: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}
