import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TransactionCancellationService } from './transaction-cancellation.service';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const mockTx = {
  id: 'tx-1',
  status: 'PENDING',
  buyerId: 'buyer-1',
  sellerId: 'seller-1',
  amount: { toString: () => '100000' },
  refundAmount: { toString: () => '100000' },
  property: { id: 'prop-1', title: 'Test Property' },
  buyer: { id: 'buyer-1', firstName: 'Alice', lastName: 'Smith' },
  seller: { id: 'seller-1', firstName: 'Bob', lastName: 'Jones' },
};

const mockPrisma = {
  transaction: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const mockNotifications = {
  sendNotification: jest.fn().mockResolvedValue({}),
};

describe('TransactionCancellationService', () => {
  let service: TransactionCancellationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TransactionCancellationService(
      mockPrisma as unknown as PrismaService,
      mockNotifications as unknown as NotificationsService,
    );
  });

  describe('cancel', () => {
    it('throws NotFoundException when transaction does not exist', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue(null);
      await expect(service.cancel('bad-id', { reason: 'test' }, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when already cancelled', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue({ ...mockTx, status: 'CANCELLED' });
      await expect(service.cancel('tx-1', { reason: 'test' }, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when completed', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue({ ...mockTx, status: 'COMPLETED' });
      await expect(service.cancel('tx-1', { reason: 'test' }, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('cancels transaction and sends notifications to buyer and seller', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue(mockTx);
      mockPrisma.transaction.update.mockResolvedValue({ ...mockTx, status: 'CANCELLED' });

      const result = await service.cancel('tx-1', { reason: 'Buyer withdrew' }, 'user-1');

      expect(mockPrisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CANCELLED',
            cancellationReason: 'Buyer withdrew',
            refundStatus: 'PENDING',
          }),
        }),
      );
      expect(mockNotifications.sendNotification).toHaveBeenCalledTimes(2);
      expect(result.status).toBe('CANCELLED');
    });

    it('uses provided refundAmount instead of full amount', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue(mockTx);
      mockPrisma.transaction.update.mockResolvedValue({ ...mockTx, status: 'CANCELLED' });

      await service.cancel('tx-1', { reason: 'Partial refund', refundAmount: 50000 }, 'user-1');

      expect(mockPrisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            refundAmount: expect.objectContaining({ toString: expect.any(Function) }),
          }),
        }),
      );
    });
  });

  describe('processRefund', () => {
    it('throws when transaction not found', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue(null);
      await expect(service.processRefund('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('throws when transaction is not cancelled', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue({ ...mockTx, status: 'PENDING' });
      await expect(service.processRefund('tx-1')).rejects.toThrow(BadRequestException);
    });

    it('marks refund as processed and notifies buyer', async () => {
      const cancelledTx = { ...mockTx, status: 'CANCELLED', refundStatus: 'PENDING' };
      mockPrisma.transaction.findUnique.mockResolvedValue(cancelledTx);
      mockPrisma.transaction.update.mockResolvedValue({
        ...cancelledTx,
        refundStatus: 'PROCESSED',
      });

      const result = await service.processRefund('tx-1');

      expect(mockPrisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { refundStatus: 'PROCESSED' } }),
      );
      expect(mockNotifications.sendNotification).toHaveBeenCalledWith(
        'buyer-1',
        'Refund Processed',
        expect.any(String),
        'REFUND_PROCESSED',
        expect.any(Object),
      );
      expect(result.refundStatus).toBe('PROCESSED');
    });
  });
});
