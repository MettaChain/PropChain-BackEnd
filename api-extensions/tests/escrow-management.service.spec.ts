import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ESCROW_PRISMA_SERVICE,
  EscrowManagementService,
  EscrowStatus,
} from '../services/escrow-management.service';

describe('EscrowManagementService (#1559)', () => {
  let service: EscrowManagementService;
  const prisma = {
    transaction: { findUnique: jest.fn() },
    transactionHistory: { create: jest.fn() },
  };

  const transaction = (amount: unknown = 100_000) => ({ id: 'tx-1', amount });

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.transaction.findUnique.mockResolvedValue(transaction());
    prisma.transactionHistory.create.mockResolvedValue({ id: 'audit-1' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [EscrowManagementService, { provide: ESCROW_PRISMA_SERVICE, useValue: prisma }],
    }).compile();
    service = module.get<EscrowManagementService>(EscrowManagementService);
  });

  it('rejects non-finite escrow amounts', async () => {
    await expect(service.create({ transactionId: 'tx-1', amount: Number.NaN })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.transaction.findUnique).not.toHaveBeenCalled();
  });

  it('rejects zero or negative escrow amounts', async () => {
    await expect(service.create({ transactionId: 'tx-1', amount: 0 })).rejects.toThrow(
      'Escrow amount must be greater than zero',
    );
    await expect(service.create({ transactionId: 'tx-1', amount: -10 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects escrow creation for a missing transaction', async () => {
    prisma.transaction.findUnique.mockResolvedValue(null);

    await expect(service.create({ transactionId: 'tx-1', amount: 100 })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('prevents duplicate escrows for the same transaction', async () => {
    await service.create({ transactionId: 'tx-1', amount: 100 });

    await expect(service.create({ transactionId: 'tx-1', amount: 100 })).rejects.toThrow(
      ConflictException,
    );
  });

  it('prevents escrows larger than the transaction amount', async () => {
    await expect(service.create({ transactionId: 'tx-1', amount: 100_001 })).rejects.toThrow(
      'Escrow amount cannot exceed the transaction amount',
    );
  });

  it('creates escrow with conditions and records the creation audit trail', async () => {
    const result = await service.create({
      transactionId: 'tx-1',
      amount: 25_000,
      conditions: ['DOCUMENTS_VERIFIED', 'INSPECTION_PASSED'],
      actorId: 'agent-1',
    });

    expect(prisma.transaction.findUnique).toHaveBeenCalledWith({ where: { id: 'tx-1' } });
    expect(result).toMatchObject({
      transactionId: 'tx-1',
      amount: 25_000,
      status: EscrowStatus.HELD,
      balance: 25_000,
      conditions: ['DOCUMENTS_VERIFIED', 'INSPECTION_PASSED'],
      metConditions: [],
    });
    expect(result.auditTrail.map((entry) => entry.action)).toEqual(['CREATED', 'FUNDS_HELD']);
    expect(prisma.transactionHistory.create).toHaveBeenCalledTimes(2);
    expect(prisma.transactionHistory.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        transactionId: 'tx-1',
        actorId: 'agent-1',
        notes: JSON.stringify({ action: 'CREATED', details: null }),
        metadata: { action: 'CREATED' },
      }),
    });
  });

  it('creates escrow without conditions or an actor', async () => {
    const result = await service.create({ transactionId: 'tx-1', amount: 500 });

    expect(result.conditions).toEqual([]);
    expect(result.auditTrail[0].actorId).toBeUndefined();
    expect(prisma.transactionHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorId: null }),
    });
  });

  it('finds escrow by transaction id and enforces balance integrity', async () => {
    await service.create({ transactionId: 'tx-1', amount: 750 });

    const found = await service.findOne('tx-1');
    expect(found).toMatchObject({ amount: 750, balance: 750 });
    await expect(service.getBalance('tx-1')).resolves.toBe(750);
    await expect(service.getAuditTrail('tx-1')).resolves.toHaveLength(2);
  });

  it('throws when escrow or its audit trail does not exist', async () => {
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    await expect(service.getBalance('missing')).rejects.toThrow(
      'Escrow for transaction missing not found',
    );
    await expect(service.getAuditTrail('missing')).rejects.toThrow(NotFoundException);
  });

  it('records a met condition exactly once', async () => {
    await service.create({
      transactionId: 'tx-1',
      amount: 100,
      conditions: ['DOCUMENTS_VERIFIED'],
    });

    const first = await service.markConditionMet('tx-1', 'DOCUMENTS_VERIFIED', 'agent-1');
    const second = await service.markConditionMet('tx-1', 'DOCUMENTS_VERIFIED', 'agent-1');

    expect(first.metConditions).toEqual(['DOCUMENTS_VERIFIED']);
    expect(second).toEqual(first);
    expect(prisma.transactionHistory.create).toHaveBeenCalledTimes(3);
    expect(prisma.transactionHistory.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        notes: JSON.stringify({ action: 'CONDITION_MET', details: 'DOCUMENTS_VERIFIED' }),
      }),
    });
  });

  it('rejects unknown or late conditions', async () => {
    await service.create({
      transactionId: 'tx-1',
      amount: 100,
      conditions: ['DOCUMENTS_VERIFIED'],
    });

    await expect(service.markConditionMet('tx-1', 'TITLE_TRANSFERRED')).rejects.toThrow(
      'Condition TITLE_TRANSFERRED is not required for this escrow',
    );

    await service.markConditionMet('tx-1', 'DOCUMENTS_VERIFIED');
    await service.release({ transactionId: 'tx-1' });
    await expect(service.markConditionMet('tx-1', 'DOCUMENTS_VERIFIED')).rejects.toThrow(
      ConflictException,
    );
  });

  it('blocks release while conditions remain unmet', async () => {
    await service.create({
      transactionId: 'tx-1',
      amount: 100,
      conditions: ['DOCUMENTS_VERIFIED', 'INSPECTION_PASSED'],
    });
    await service.markConditionMet('tx-1', 'DOCUMENTS_VERIFIED');

    await expect(service.release({ transactionId: 'tx-1' })).rejects.toThrow(
      'Cannot release escrow before conditions are met: INSPECTION_PASSED',
    );
  });

  it('releases escrow after all conditions are met and zeroes the balance', async () => {
    await service.create({
      transactionId: 'tx-1',
      amount: 100,
      conditions: ['DOCUMENTS_VERIFIED'],
      actorId: 'agent-1',
    });
    await service.markConditionMet('tx-1', 'DOCUMENTS_VERIFIED');

    const result = await service.release({ transactionId: 'tx-1', actorId: 'agent-2' });

    expect(result).toMatchObject({
      status: EscrowStatus.RELEASED,
      balance: 0,
    });
    expect(result.releasedAt).toBeInstanceOf(Date);
    expect(await service.getBalance('tx-1')).toBe(0);
    expect(result.auditTrail.map((entry) => entry.action)).toEqual([
      'CREATED',
      'FUNDS_HELD',
      'CONDITION_MET',
      'RELEASED',
    ]);
    expect(prisma.transactionHistory.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ metadata: { action: 'RELEASED' }, actorId: 'agent-2' }),
    });
  });

  it('prevents double release', async () => {
    await service.create({ transactionId: 'tx-1', amount: 100 });
    await service.release({ transactionId: 'tx-1' });

    await expect(service.release({ transactionId: 'tx-1' })).rejects.toThrow(
      'Escrow has already been released',
    );
  });

  it('refunds held escrow with a reason and zeroes the balance', async () => {
    await service.create({ transactionId: 'tx-1', amount: 100 });

    const result = await service.refund({
      transactionId: 'tx-1',
      reason: 'Buyer withdrew',
      actorId: 'agent-1',
    });

    expect(result).toMatchObject({
      status: EscrowStatus.REFUNDED,
      balance: 0,
    });
    expect(result.refundedAt).toBeInstanceOf(Date);
    expect(prisma.transactionHistory.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        notes: JSON.stringify({ action: 'REFUNDED', details: 'Buyer withdrew' }),
        actorId: 'agent-1',
      }),
    });
  });

  it('prevents double refund and refund after release', async () => {
    await service.create({ transactionId: 'tx-1', amount: 100 });
    await service.refund({ transactionId: 'tx-1', reason: 'Cancelled' });

    await expect(
      service.refund({ transactionId: 'tx-1', reason: 'Cancelled again' }),
    ).rejects.toThrow('Escrow has already been refunded');

    await service.create({ transactionId: 'tx-2', amount: 100 });
    await service.release({ transactionId: 'tx-2' });
    await expect(service.refund({ transactionId: 'tx-2', reason: 'Too late' })).rejects.toThrow(
      'Released escrow cannot be refunded',
    );
  });

  it('prevents release after refund', async () => {
    await service.create({ transactionId: 'tx-1', amount: 100 });
    await service.refund({ transactionId: 'tx-1', reason: 'Cancelled' });

    await expect(service.release({ transactionId: 'tx-1' })).rejects.toThrow(
      'Refunded escrow cannot be released',
    );
  });
});
