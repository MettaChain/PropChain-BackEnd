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

  it('rejects unknown milestones and milestones on a pending escrow', async () => {
    await create();
    await expect(service.markMilestoneComplete('tx-1', 'TITLE_TRANSFERRED')).rejects.toThrow(
      ConflictException,
    );
    await service.holdFunds('tx-1');
    await expect(service.markMilestoneComplete('tx-1', 'TITLE_TRANSFERRED')).rejects.toThrow(
      'Milestone TITLE_TRANSFERRED is not required for this escrow',
    );
  });

  it('blocks release until all milestones are complete', async () => {
    await create({ milestones: ['DOCUMENTS_VERIFIED', 'INSPECTION_PASSED'] });
    await service.holdFunds('tx-1');

    await expect(service.release('tx-1')).rejects.toThrow(
      'Cannot release escrow before milestones are complete: INSPECTION_PASSED',
    );
  });

  it('releases held funds after milestones complete and zeroes the balance', async () => {
    await create();
    await service.holdFunds('tx-1');
    await service.markMilestoneComplete('tx-1', 'DOCUMENTS_VERIFIED');
    const result = await service.release('tx-1', 'agent-2');

    expect(result).toMatchObject({ status: EscrowStatus.RELEASED, balance: 0 });
    expect(result.releasedAt).toBeInstanceOf(Date);
    expect(await service.getBalance('tx-1')).toBe(0);
    expect(result.auditTrail.map((entry) => entry.action)).toEqual([
      'CREATED',
      'FUNDS_HELD',
      'MILESTONE_COMPLETED',
      'RELEASED',
    ]);
    expect(prisma.transactionHistory.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ metadata: { action: 'RELEASED' }, actorId: 'agent-2' }),
    });
  });

  it('prevents double release and release after refund', async () => {
    await create();
    await service.holdFunds('tx-1');
    await service.release('tx-1');
    await expect(service.release('tx-1')).rejects.toThrow('Escrow has already been released');

    await create({ transactionId: 'tx-2' });
    await service.refund('tx-2', 'Buyer withdrew');
    await expect(service.release('tx-2')).rejects.toThrow(
      'Refunded escrow cannot be released',
    );
  });

  it('refunds held escrow with a reason and zeroes the balance', async () => {
    await create();
    await service.holdFunds('tx-1');
    const result = await service.refund('tx-1', 'Inspection failed', 'agent-1');

    expect(result).toMatchObject({ status: EscrowStatus.REFUNDED, balance: 0 });
    expect(result.refundedAt).toBeInstanceOf(Date);
    expect(prisma.transactionHistory.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        notes: JSON.stringify({ action: 'REFUNDED', details: 'Inspection failed' }),
        actorId: 'agent-1',
      }),
    });
  });

  it('prevents double refund', async () => {
    await create();
    await service.refund('tx-1', 'Cancelled');
    await expect(service.refund('tx-1', 'Again')).rejects.toThrow(
      'Escrow has already been refunded',
    );
  });

  it('places a dispute hold and locks the escrow', async () => {
    await create();
    const result = await service.placeDisputeHold('tx-1', 'Title dispute', 'agent-1');

    expect(result).toMatchObject({
      status: EscrowStatus.HELD,
      balance: 112_860,
      disputed: true,
      disputeReason: 'Title dispute',
    });
    expect(result.auditTrail.map((entry) => entry.action)).toEqual([
      'CREATED',
      'FUNDS_HELD',
      'DISPUTE_HOLD',
    ]);
    await expect(service.release('tx-1')).rejects.toThrow(
      'Disputed escrow must be resolved before release',
    );
    await expect(service.placeDisputeHold('tx-1', 'Again')).rejects.toThrow(ConflictException);
  });

  it('resolves a dispute by releasing after milestones are met', async () => {
    await create();
    await service.placeDisputeHold('tx-1', 'Resolved out of court');
    await service.markMilestoneComplete('tx-1', 'DOCUMENTS_VERIFIED');
    const result = await service.resolveDispute('tx-1', DisputeResolution.RELEASE);

    expect(result.status).toBe(EscrowStatus.RELEASED);
    expect(result.disputed).toBe(false);
    expect(result.auditTrail.map((entry) => entry.action)).toContain('DISPUTE_RESOLVED');
  });

  it('resolves a dispute by refunding the buyer', async () => {
    await create();
    await service.holdFunds('tx-1');
    await service.placeDisputeHold('tx-1', 'Fraud suspected');
    const result = await service.resolveDispute('tx-1', DisputeResolution.REFUND);

    expect(result.status).toBe(EscrowStatus.REFUNDED);
    expect(result.disputed).toBe(false);
    expect(result.balance).toBe(0);
  });

  it('rejects disputes on closed escrows and resolutions without a dispute', async () => {
    await create();
    await service.holdFunds('tx-1');
    await service.release('tx-1');
    await expect(service.placeDisputeHold('tx-1', 'Too late')).rejects.toThrow(
      ConflictException,
    );

    await create({ transactionId: 'tx-2' });
    await expect(
      service.resolveDispute('tx-2', DisputeResolution.RELEASE),
    ).rejects.toThrow('Escrow is not under a dispute hold');
  });

  it('exposes queries and the fee breakdown, and reports unknown transactions', async () => {
    await create();
    await create({ transactionId: 'tx-2', amount: 50_000 });

    expect(service.findAll()).toHaveLength(2);
    expect(service.findAll('tx-1')).toHaveLength(1);
    expect(await service.findOne('tx-1')).toMatchObject({ transactionId: 'tx-1' });
    expect(await service.getAuditTrail('tx-1')).toHaveLength(1);
    expect((await service.getFeeBreakdown('tx-1')).platformFee).toBe(1500);

    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    await expect(service.getBalance('missing')).rejects.toThrow(NotFoundException);
    await expect(service.getAuditTrail('missing')).rejects.toThrow(NotFoundException);
    await expect(service.getFeeBreakdown('missing')).rejects.toThrow(NotFoundException);
  });
});
