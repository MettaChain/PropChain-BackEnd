import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateDisputeDto, ResolveDisputeDto } from './dto/dispute.dto';
import { DisputeStatus } from '../types/prisma.types';

@Injectable()
export class DisputesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateDisputeDto) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: dto.transactionId },
      include: { buyer: true, seller: true },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.buyerId !== userId && transaction.sellerId !== userId) {
      throw new ForbiddenException('Only parties involved in the transaction can initiate a dispute');
    }

    return this.prisma.dispute.create({
      data: {
        transactionId: dto.transactionId,
        initiatorId: userId,
        reason: dto.reason,
        description: dto.description,
        status: DisputeStatus.OPEN,
      },
    });
  }

  async addEvidence(disputeId: string, userId: string, documentId: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.userId !== userId) {
      throw new ForbiddenException('You can only attach your own documents as evidence');
    }

    return this.prisma.document.update({
      where: { id: documentId },
      data: { disputeId },
    });
  }

  async resolve(disputeId: string, adminId: string, dto: ResolveDisputeDto) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    if (dispute.status === DisputeStatus.RESOLVED) {
      throw new BadRequestException('Dispute is already resolved');
    }

    return this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: dto.status,
        arbitratorId: adminId,
        resolutionDetails: dto.details,
        resolvedAt: new Date(),
      },
    });
  }

  async findOne(id: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: {
        transaction: true,
        initiator: { select: { id: true, email: true, firstName: true, lastName: true } },
        arbitrator: { select: { id: true, email: true, firstName: true, lastName: true } },
        evidence: true,
      },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    return dispute;
  }

  async findByTransaction(transactionId: string) {
    return this.prisma.dispute.findMany({
      where: { transactionId },
      include: { evidence: true },
    });
  }
}
