import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionFeesService } from '../../../src/transactions/transaction-fees.service';
import {
  CreateEscrowDto,
  DisputeResolution,
  EscrowStatus,
} from './dto/escrow-management.dto';
import {
  ESCROW_MANAGEMENT_PRISMA,
  EscrowManagementService,
} from './escrow-management.service';

describe('EscrowManagementService (#1611)', () => {
  let service: EscrowManagementService;

  const prisma = {
    transaction: { findUnique: jest.fn(), update: jest.fn() },
    transactionHistory: { create: jest.fn() },
  };

  const transaction = (amount: number = 100_000) => ({ id: 'tx-1', amount });

  const create = (overrides: Partial<CreateEscrowDto> = {}) =>
    service.create({
      transactionId: 'tx-1',
      amount: 100_000,
      milestones: ['DOCUMENTS_VERIFIED'],
      ...overrides,
    });

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.transaction.findUnique.mockResolvedValue(transaction());
    prisma.transaction.update.mockResolvedValue({ id: 'tx-1' });
    prisma.transactionHistory.create.mockResolvedValue({ id: 'audit-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscrowManagementService,
        TransactionFeesService,
        { provide: ESCROW_MANAGEMENT_PRISMA, useValue: prisma },
      ],
    }).compile();

    service = module.get<EscrowManagementService>(EscrowManagementService);
  });

  it('rejects non-finite, zero and negative amounts', async () => {
    await expect(create({ amount: Number.NaN })).rejects.toThrow(BadRequestException);
    await expect(create({ amount: 0 })).rejects.toThrow(
      'Escrow amount must be greater than zero',
    );
    await expect(create({ amount: -1 })).rejects.toThrow(BadRequestException);
    expect(prisma.transaction.findUnique).not.toHaveBeenCalled();
  });

  it('rejects escrows for missing transactions', async () => {
    prisma.transaction.findUnique.mockResolvedValue(null);
    await expect(create()).rejects.toThrow(NotFoundException);
  });

  it('rejects duplicate escrows for one transaction', async () => {
    await create();
    await expect(create()).rejects.toThrow(ConflictException);
  });

  it('rejects an escrow larger than the transaction amount', async () => {
    await expect(create({ amount: 100_001 })).rejects.toThrow(
      'Escrow amount cannot exceed the transaction amount',
    );
  });

  it('creates a pending escrow with the fee-inclusive amount', async () => {
    const result = await create({ actorId: 'agent-1' });

    expect(result).toMatchObject({
      transactionId: 'tx-1',
      baseAmount: 100_000,
      amount: 112_860,
      currency: 'USD',
      status: EscrowStatus.PENDING,
      balance: 0,
      milestones: ['DOCUMENTS_VERIFIED'],
      disputed: false,
    });
    expect(result.feeBreakdown.totalAmount).toBe(112_860);
    expect(result.auditTrail.map((entry) => entry.action)).toEqual(['CREATED']);
  });

  it('mirrors escrow creation onto the transaction record', async () => {
    await create();
    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: expect.objectContaining({
        escrowStatus: 'PENDING',
        escrowAmount: 112_860,
      }),
    });
  });

  it('holds funds and transitions to HELD', async () => {
    await create();
    const result = await service.holdFunds('tx-1', { actorId: 'buyer-1' });

    expect(result.status).toBe(EscrowStatus.HELD);
    expect(result.balance).toBe(112_860);
    expect(result.auditTrail.map((entry) => entry.action)).toEqual([
      'CREATED',
      'FUNDS_HELD',
    ]);
    expect(await service.getBalance('tx-1')).toBe(112_860);
  });

  it('holds a partial amount when requested', async () => {
    await create();
    const result = await service.holdFunds('tx-1', { amount: 50_000 });
    expect(result.balance).toBe(50_000);
  });

  it('rejects holding funds twice or with an invalid amount', async () => {
    await create();
    await service.holdFunds('tx-1');
    await expect(service.holdFunds('tx-1')).rejects.toThrow(ConflictException);

    await create({ transactionId: 'tx-2' });
    await expect(service.holdFunds('tx-2', { amount: 200_000 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('records a met milestone exactly once', async () => {
    await create();
    await service.holdFunds('tx-1');

    const first = await service.markMilestoneComplete(
      'tx-1',
      'DOCUMENTS_VERIFIED',
      'agent-1',
    );
    const second = await service.markMilestoneComplete('tx-1', 'DOCUMENTS_VERIFIED');

    expect(first.metMilestones).toEqual(['DOCUMENTS_VERIFIED']);
    expect(second).toEqual(first);
    expect(first.auditTrail.map((entry) => entry.action)).toEqual([
      'CREATED',
      'FUNDS_HELD',
      'MILESTONE_COMPLETED',
    ]);
  });
