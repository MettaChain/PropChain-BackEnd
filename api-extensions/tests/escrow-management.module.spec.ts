import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { AuthUserPayload } from '../../src/auth/types/auth-user.type';
import { TransactionFeesService } from '../../src/transactions/transaction-fees.service';
import {
  DisputeResolution,
  EscrowStatus,
  ReleaseEscrowDto,
} from '../modules/escrow-management/dto/escrow-management.dto';
import { EscrowManagementController } from '../modules/escrow-management/escrow-management.controller';
import {
  ESCROW_MANAGEMENT_PRISMA,
  EscrowManagementService,
} from '../modules/escrow-management/escrow-management.service';

/**
 * Discovery spec for the api-extensions Jest project (#1611). The exhaustive
 * service tests live with the module; these exercise the controller wiring.
 */
describe('EscrowManagementController (#1611)', () => {
  let controller: EscrowManagementController;

  const user = {
    sub: 'auth-user',
    email: 'user@example.com',
    role: 'BUYER',
    tier: 'BASIC',
    type: 'access',
  } as unknown as AuthUserPayload;

  const prisma = {
    transaction: { findUnique: jest.fn(), update: jest.fn() },
    transactionHistory: { create: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.transaction.findUnique.mockResolvedValue({ id: 'tx-1', amount: 200_000 });
    prisma.transaction.update.mockResolvedValue({ id: 'tx-1' });
    prisma.transactionHistory.create.mockResolvedValue({ id: 'audit-1' });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EscrowManagementController],
      providers: [
        EscrowManagementService,
        TransactionFeesService,
        { provide: ESCROW_MANAGEMENT_PRISMA, useValue: prisma },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<EscrowManagementController>(EscrowManagementController);
  });

  const create = () =>
    controller.create(
      {
        transactionId: 'tx-1',
        amount: 100_000,
        milestones: ['DOCUMENTS_VERIFIED'],
      },
      user,
    );

  it('requires the JWT auth guard on every endpoint', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, EscrowManagementController)).toContain(
      JwtAuthGuard,
    );
  });

  it('creates, holds and releases an escrow through the controller', async () => {
    const created = await create();
    expect(created.status).toBe(EscrowStatus.PENDING);

    const held = await controller.holdFunds('tx-1', {}, user);
    expect(held.status).toBe(EscrowStatus.HELD);

    await controller.completeMilestone('tx-1', { milestoneId: 'DOCUMENTS_VERIFIED' }, user);
    const released = await controller.release('tx-1', {}, user);
    expect(released.status).toBe(EscrowStatus.RELEASED);
    expect(await controller.getBalance('tx-1')).toBe(0);
  });

  it('derives the actor from the authenticated user rather than the request body', async () => {
    await controller.create(
      {
        transactionId: 'tx-1',
        amount: 100_000,
        milestones: ['DOCUMENTS_VERIFIED'],
        actorId: 'spoofed',
      } as never,
      user,
    );
    await controller.holdFunds('tx-1', {}, user);
    await controller.completeMilestone('tx-1', { milestoneId: 'DOCUMENTS_VERIFIED' }, user);

    const released = await controller.release(
      'tx-1',
      { actorId: 'spoofed' } as ReleaseEscrowDto & { actorId: string },
      user,
    );

    expect(released.auditTrail[0].actorId).toBe('auth-user');
    expect(released.auditTrail.at(-1)?.actorId).toBe('auth-user');
  });

  it('refunds an escrow through the controller', async () => {
    await create();
    const refunded = await controller.refund('tx-1', { reason: 'Buyer withdrew' }, user);
    expect(refunded.status).toBe(EscrowStatus.REFUNDED);
    expect(await controller.getAuditTrail('tx-1')).toHaveLength(2);
  });

  it('exposes list, detail, audit and fee endpoints', async () => {
    await create();
    expect(controller.findAll()).toHaveLength(1);
    expect(controller.findAll('tx-1')).toHaveLength(1);
    expect(await controller.findOne('tx-1')).toMatchObject({ transactionId: 'tx-1' });
    expect(await controller.getAuditTrail('tx-1')).toHaveLength(1);
    expect((await controller.getFeeBreakdown('tx-1')).totalAmount).toBe(112_860);
  });

  it('routes dispute holds and resolutions through the controller', async () => {
    await create();
    await controller.holdFunds('tx-1', {}, user);
    await controller.completeMilestone('tx-1', { milestoneId: 'DOCUMENTS_VERIFIED' }, user);
    const disputed = await controller.placeDisputeHold('tx-1', { reason: 'Title dispute' }, user);
    expect(disputed.disputed).toBe(true);

    const resolved = await controller.resolveDispute(
      'tx-1',
      { resolution: DisputeResolution.RELEASE },
      user,
    );
    expect(resolved.status).toBe(EscrowStatus.RELEASED);
    expect(resolved.disputed).toBe(false);
  });
});
