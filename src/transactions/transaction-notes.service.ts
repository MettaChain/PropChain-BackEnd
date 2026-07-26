import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateNoteDto } from './dto/transaction-note.dto';

@Injectable()
export class TransactionNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(transactionId: string, authorId: string, dto: CreateNoteDto) {
    const tx = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException('Transaction not found');

    return this.prisma.transactionNote.create({
      data: {
        transactionId,
        authorId,
        content: dto.content,
        isPublic: dto.isPublic ?? true,
      },
    });
  }

  async findByTransaction(transactionId: string, viewerId: string, viewerRole: string) {
    const isPrivileged = viewerRole === 'ADMIN' || viewerRole === 'AGENT';
    const tx = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException('Transaction not found');

    const isParty = tx.buyerId === viewerId || tx.sellerId === viewerId;

    const where: Prisma.TransactionNoteWhereInput = { transactionId };
    if (!isPrivileged && !isParty) {
      where.isPublic = true;
    } else if (!isPrivileged) {
      where.OR = [{ isPublic: true }, { authorId: viewerId }];
    }

    return this.prisma.transactionNote.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async remove(noteId: string, requesterId: string, requesterRole: string) {
    const note = await this.prisma.transactionNote.findUnique({ where: { id: noteId } });
    if (!note) throw new NotFoundException('Note not found');

    const isPrivileged = requesterRole === 'ADMIN';
    if (note.authorId !== requesterId && !isPrivileged) {
      throw new ForbiddenException('Only the author or admin can delete this note');
    }

    return this.prisma.transactionNote.delete({ where: { id: noteId } });
  }
}
