import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../src/database/prisma.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { TransactionStatus, TransactionType, UserRole } from '../../src/types/prisma.types';
import { TransactionsService } from '../../src/transactions/transactions.service';

describe('TransactionsService', () => {
  let service: TransactionsService;

  const mockPrismaService = {
    property: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    transaction: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    transactionTaxStrategy: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  } as any;

  const mockNotificationsService = {
    sendNotification: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get(TransactionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates a transaction linked to property, buyer, seller, and amount', async () => {
    mockPrismaService.property.findUnique.mockResolvedValue({
      id: 'property-1',
      title: 'Ocean View',
      address: '123 Coast St',
      ownerId: 'seller-1',
    });
    mockPrismaService.user.findUnique
      .mockResolvedValueOnce({
        id: 'buyer-1',
        firstName: 'Buyer',
        lastName: 'One',
        email: 'buyer@example.com',
      })
      .mockResolvedValueOnce({
        id: 'seller-1',
        firstName: 'Seller',
        lastName: 'One',
        email: 'seller@example.com',
      });
    mockPrismaService.transaction.create.mockResolvedValue({
      id: 'txn-1',
      amount: { toString: () => '1000' },
      property: {
        id: 'property-1',
        title: 'Ocean View',
        address: '123 Coast St',
      },
      buyer: {
        id: 'buyer-1',
        firstName: 'Buyer',
        lastName: 'One',
        email: 'buyer@example.com',
      },
      seller: {
        id: 'seller-1',
        firstName: 'Seller',
        lastName: 'One',
        email: 'seller@example.com',
      },
    });

    const result = await service.createTransaction(
      {
        propertyId: 'property-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        amount: 1000,
        type: TransactionType.SALE,
      },
      {
        sub: 'buyer-1',
        email: 'buyer@example.com',
        role: UserRole.USER,
        type: 'access',
      },
    );

    expect(mockPrismaService.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        propertyId: 'property-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        type: TransactionType.SALE,
        status: TransactionStatus.PENDING,
      }),
      include: expect.objectContaining({
        property: expect.any(Object),
        buyer: expect.any(Object),
        seller: expect.any(Object),
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        amount: expect.objectContaining({ toString: expect.any(Function) }),
        property: expect.objectContaining({ id: 'property-1' }),
        buyer: expect.objectContaining({ id: 'buyer-1' }),
        seller: expect.objectContaining({ id: 'seller-1' }),
      }),
    );
  });

  it('creates transactions with PENDING status by default', async () => {
    mockPrismaService.property.findUnique.mockResolvedValue({
      id: 'property-1',
      title: 'Property',
      address: '123 Main St',
      ownerId: 'seller-1',
    });
    mockPrismaService.user.findUnique
      .mockResolvedValueOnce({
        id: 'buyer-1',
        firstName: 'Buyer',
        lastName: 'One',
        email: 'buyer@example.com',
      })
      .mockResolvedValueOnce({
        id: 'seller-1',
        firstName: 'Seller',
        lastName: 'One',
        email: 'seller@example.com',
      });
    mockPrismaService.transaction.create.mockResolvedValue({
      id: 'txn-1',
      status: TransactionStatus.PENDING,
    });

    await service.createTransaction(
      {
        propertyId: 'property-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        amount: 1000,
        type: TransactionType.SALE,
      },
      {
        sub: 'buyer-1',
        email: 'buyer@example.com',
        role: UserRole.USER,
        type: 'access',
      },
    );

    expect(mockPrismaService.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        propertyId: 'property-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        type: TransactionType.SALE,
        status: TransactionStatus.PENDING,
      }),
      include: expect.any(Object),
    });
  });

  it('rejects invalid property references', async () => {
    mockPrismaService.property.findUnique.mockResolvedValue(null);
    mockPrismaService.user.findUnique
      .mockResolvedValueOnce({
        id: 'buyer-1',
        firstName: 'Buyer',
        lastName: 'One',
        email: 'buyer@example.com',
      })
      .mockResolvedValueOnce({
        id: 'seller-1',
        firstName: 'Seller',
        lastName: 'One',
        email: 'seller@example.com',
      });

    await expect(
      service.createTransaction(
        {
          propertyId: 'missing-property',
          buyerId: 'buyer-1',
          sellerId: 'seller-1',
          amount: 1000,
          type: TransactionType.SALE,
        },
        {
          sub: 'buyer-1',
          email: 'buyer@example.com',
          role: UserRole.USER,
          type: 'access',
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects invalid buyer references', async () => {
    mockPrismaService.property.findUnique.mockResolvedValue({
      id: 'property-1',
      title: 'Property',
      address: '123 Main St',
      ownerId: 'seller-1',
    });
    mockPrismaService.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'seller-1',
        firstName: 'Seller',
        lastName: 'One',
        email: 'seller@example.com',
      });

    await expect(
      service.createTransaction(
        {
          propertyId: 'property-1',
          buyerId: 'missing-buyer',
          sellerId: 'seller-1',
          amount: 1000,
          type: TransactionType.SALE,
        },
        {
          sub: 'missing-buyer',
          email: 'buyer@example.com',
          role: UserRole.USER,
          type: 'access',
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects invalid seller references', async () => {
    mockPrismaService.property.findUnique.mockResolvedValue({
      id: 'property-1',
      title: 'Property',
      address: '123 Main St',
      ownerId: 'seller-1',
    });
    mockPrismaService.user.findUnique
      .mockResolvedValueOnce({
        id: 'buyer-1',
        firstName: 'Buyer',
        lastName: 'One',
        email: 'buyer@example.com',
      })
      .mockResolvedValueOnce(null);

    await expect(
      service.createTransaction(
        {
          propertyId: 'property-1',
          buyerId: 'buyer-1',
          sellerId: 'missing-seller',
          amount: 1000,
          type: TransactionType.SALE,
        },
        {
          sub: 'buyer-1',
          email: 'buyer@example.com',
          role: UserRole.USER,
          type: 'access',
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows a valid transition from PENDING to COMPLETED', async () => {
    mockPrismaService.transaction.findUnique.mockResolvedValue({
      id: 'txn-1',
      status: TransactionStatus.PENDING,
    });
    mockPrismaService.transaction.update.mockResolvedValue({
      id: 'txn-1',
      status: TransactionStatus.COMPLETED,
    });

    const result = await service.updateTransactionStatus('txn-1', TransactionStatus.COMPLETED);

    expect(mockPrismaService.transaction.update).toHaveBeenCalledWith({
      where: { id: 'txn-1' },
      data: { status: TransactionStatus.COMPLETED },
    });
    expect(result.status).toBe(TransactionStatus.COMPLETED);
  });

  it('allows a valid transition from PENDING to CANCELLED', async () => {
    mockPrismaService.transaction.findUnique.mockResolvedValue({
      id: 'txn-2',
      status: TransactionStatus.PENDING,
    });
    mockPrismaService.transaction.update.mockResolvedValue({
      id: 'txn-2',
      status: TransactionStatus.CANCELLED,
    });

    const result = await service.updateTransactionStatus('txn-2', TransactionStatus.CANCELLED);

    expect(mockPrismaService.transaction.update).toHaveBeenCalledWith({
      where: { id: 'txn-2' },
      data: { status: TransactionStatus.CANCELLED },
    });
    expect(result.status).toBe(TransactionStatus.CANCELLED);
  });

  it('rejects invalid status transitions', async () => {
    mockPrismaService.transaction.findUnique.mockResolvedValue({
      id: 'txn-3',
      status: TransactionStatus.COMPLETED,
    });

    await expect(
      service.updateTransactionStatus('txn-3', TransactionStatus.CANCELLED),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockPrismaService.transaction.update).not.toHaveBeenCalled();
  });

  it('rejects updates for missing transactions', async () => {
    mockPrismaService.transaction.findUnique.mockResolvedValue(null);

    await expect(
      service.updateTransactionStatus('missing-txn', TransactionStatus.COMPLETED),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates and stores a tax strategy suggestion with computed impact and notifications', async () => {
    mockPrismaService.transaction.findUnique.mockResolvedValue({
      id: 'txn-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      amount: { mul: (value: number) => ({ div: (divisor: number) => (1000 * value) / divisor }) },
      property: {
        id: 'property-1',
        city: 'Austin',
        state: 'Texas',
        country: 'USA',
      },
    });
    mockPrismaService.transactionTaxStrategy.create.mockResolvedValue({
      id: 'strategy-1',
      transactionId: 'txn-1',
      strategyType: 'Installment sale timing',
      jurisdiction: 'Austin, Texas, USA',
      estimatedTaxImpact: { toString: () => '75' },
      version: 1,
    });

    const result = await service.createTaxStrategySuggestion(
      'txn-1',
      {
        strategyType: 'Installment sale timing',
        estimatedTaxRate: 7.5,
        explanation: 'Spread taxable recognition across milestones when appropriate.',
        metadata: { source: 'internal-review' },
      },
      {
        sub: 'buyer-1',
        email: 'buyer@example.com',
        role: UserRole.USER,
        type: 'access',
      },
    );

    expect(mockPrismaService.transactionTaxStrategy.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        transactionId: 'txn-1',
        createdById: 'buyer-1',
        strategyType: 'Installment sale timing',
        jurisdiction: 'Austin, Texas, USA',
        explanation: 'Spread taxable recognition across milestones when appropriate.',
        version: 1,
      }),
    });
    expect(mockNotificationsService.sendNotification).toHaveBeenCalledTimes(2);
    expect(result).toEqual(
      expect.objectContaining({
        id: 'strategy-1',
        transactionId: 'txn-1',
      }),
    );
  });

  it('updates a tax strategy suggestion without changing transaction behavior', async () => {
    mockPrismaService.transaction.findUnique.mockResolvedValue({
      id: 'txn-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      amount: { mul: (value: number) => ({ div: (divisor: number) => (1000 * value) / divisor }) },
      property: {
        id: 'property-1',
        city: 'Austin',
        state: 'Texas',
        country: 'USA',
      },
    });
    mockPrismaService.transactionTaxStrategy.findFirst.mockResolvedValue({
      id: 'strategy-1',
      transactionId: 'txn-1',
      strategyType: 'Installment sale timing',
      jurisdiction: 'Austin, Texas, USA',
      estimatedTaxRate: 5,
      estimatedTaxImpact: 50,
      explanation: 'Initial note',
      metadata: { source: 'internal-review' },
      version: 1,
    });
    mockPrismaService.transactionTaxStrategy.update.mockResolvedValue({
      id: 'strategy-1',
      transactionId: 'txn-1',
      strategyType: '1031-style planning',
      jurisdiction: 'USA',
      version: 2,
    });

    const result = await service.updateTaxStrategySuggestion(
      'txn-1',
      'strategy-1',
      {
        strategyType: '1031-style planning',
        jurisdiction: 'USA',
      },
      {
        sub: 'seller-1',
        email: 'seller@example.com',
        role: UserRole.USER,
        type: 'access',
      },
    );

    expect(mockPrismaService.transactionTaxStrategy.update).toHaveBeenCalledWith({
      where: { id: 'strategy-1' },
      data: expect.objectContaining({
        strategyType: '1031-style planning',
        jurisdiction: 'USA',
        version: 2,
      }),
    });
    expect(mockPrismaService.transaction.create).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ version: 2 }));
  });
});
