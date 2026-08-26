import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CancelTransactionDto } from './dto/cancel-transaction.dto';

@Injectable()
export class TransactionCancellationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async cancel(transactionId: string, dto: CancelTransactionDto, cancelledById: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        buyer: { select: { id: true, firstName: true, lastName: true } },
        seller: { select: { id: true, firstName: true, lastName: true } },
        property: { select: { id: true, title: true } },
      },
    });

    if (!tx) throw new NotFoundException(`Transaction ${transactionId} not found`);
    if (tx.status === 'CANCELLED')
      throw new BadRequestException('Transaction is already cancelled');
    if (tx.status === 'COMPLETED')
      throw new BadRequestException('Completed transactions cannot be cancelled');

    const refundAmount =
      dto.refundAmount !== undefined ? new Decimal(dto.refundAmount.toString()) : tx.amount;

    const cancelled = await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'CANCELLED',
        cancellationReason: dto.reason,
        cancelledById,
        cancelledAt: new Date(),
        refundAmount,
        refundStatus: 'PENDING',
      },
    });

    // Notify buyer and seller
    const propertyTitle = tx.property?.title ?? 'the property';
    const message = `Transaction for "${propertyTitle}" has been cancelled. Reason: ${dto.reason}`;

    await Promise.all([
      this.notifications.sendNotification(
        tx.buyerId,
        'Transaction Cancelled',
        message,
        'TRANSACTION_CANCELLED',
        { transactionId, refundAmount: refundAmount.toString() },
      ),
      this.notifications.sendNotification(
        tx.sellerId,
        'Transaction Cancelled',
        message,
        'TRANSACTION_CANCELLED',
        { transactionId },
      ),
    ]);

    return cancelled;
  }

  /** Mark refund as processed (e.g. called by payment webhook). */
  async processRefund(transactionId: string) {
    const tx = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException(`Transaction ${transactionId} not found`);
    if (tx.status !== 'CANCELLED') throw new BadRequestException('Transaction is not cancelled');
    if (tx.refundStatus === 'PROCESSED') throw new BadRequestException('Refund already processed');

    const updated = await this.prisma.transaction.update({
      where: { id: transactionId },
      data: { refundStatus: 'PROCESSED' },
    });

    await this.notifications.sendNotification(
      tx.buyerId,
      'Refund Processed',
      `Your refund of ${tx.refundAmount} has been processed.`,
      'REFUND_PROCESSED',
      { transactionId, refundAmount: tx.refundAmount?.toString() },
    );

    return updated;
  }
}
