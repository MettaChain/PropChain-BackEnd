import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  LeaseStatus,
  RENTAL_NOTIFICATIONS_SERVICE,
  RENTAL_PRISMA_SERVICE,
  RentalManagementService,
  RentPaymentStatus,
} from '../services/rental-management.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const START = new Date('2026-01-01T00:00:00.000Z');
const END = new Date('2026-04-01T00:00:00.000Z');

interface RentalInternals {
  leases: Map<string, { payments: Array<{ paidAt?: Date; status: RentPaymentStatus }> }>;
}

describe('RentalManagementService (#1560)', () => {
  let service: RentalManagementService;
  const prisma = { property: { findUnique: jest.fn() } };
  const notifications = { sendNotification: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.property.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === 'missing' ? null : { id: where.id }),
    );
    notifications.sendNotification.mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RentalManagementService,
        { provide: RENTAL_PRISMA_SERVICE, useValue: prisma },
        { provide: RENTAL_NOTIFICATIONS_SERVICE, useValue: notifications },
      ],
    }).compile();
    service = module.get<RentalManagementService>(RentalManagementService);
  });

  function createLease(overrides: Record<string, unknown> = {}) {
    return service.create({
      propertyId: 'property-1',
      tenantId: 'tenant-1',
      startDate: START,
      endDate: END,
      monthlyRent: 2000,
      ...overrides,
    });
  }

  function internals(): RentalInternals {
    return service as unknown as RentalInternals;
  }

  it('rejects invalid monthly rent', async () => {
    await expect(createLease({ monthlyRent: Number.NaN })).rejects.toThrow(BadRequestException);
    await expect(createLease({ monthlyRent: 0 })).rejects.toThrow(
      'Monthly rent must be greater than zero',
    );
  });

  it('rejects invalid deposit amounts', async () => {
    await expect(createLease({ depositAmount: Number.NaN })).rejects.toThrow(BadRequestException);
    await expect(createLease({ depositAmount: -1 })).rejects.toThrow(
      'Deposit amount cannot be negative',
    );
  });

  it.each([1.5, 0, 29])('rejects invalid rent due day %p', async (rentDueDay) => {
    await expect(createLease({ rentDueDay })).rejects.toThrow(
      'Rent due day must be between 1 and 28',
    );
  });

  it('rejects an end date that is not after the start date', async () => {
    await expect(createLease({ endDate: START })).rejects.toThrow(
      'Lease end date must be after the start date',
    );
  });

  it('rejects leases for unknown properties', async () => {
    await expect(createLease({ propertyId: 'missing' })).rejects.toThrow(NotFoundException);
  });

  it('creates a draft lease with explicit lease terms and a rent schedule', async () => {
    const lease = await createLease({
      landlordId: 'landlord-1',
      depositAmount: 1500,
      rentDueDay: 5,
    });

    expect(lease).toMatchObject({
      propertyId: 'property-1',
      tenantId: 'tenant-1',
      landlordId: 'landlord-1',
      status: LeaseStatus.DRAFT,
      monthlyRent: 2000,
      depositAmount: 1500,
      rentDueDay: 5,
    });
    expect(lease.payments).toHaveLength(3);
    expect(lease.payments[0]).toMatchObject({
      amount: 2000,
      status: RentPaymentStatus.SCHEDULED,
    });
    expect(lease.payments[0].dueDate.toISOString()).toBe('2026-01-05T00:00:00.000Z');
    expect(lease.alertsSent).toEqual([]);
  });

  it('uses default deposit and due day and skips due dates before the start date', async () => {
    const lease = await createLease({
      startDate: new Date('2026-01-15T00:00:00.000Z'),
      rentDueDay: undefined,
    });

    expect(lease.depositAmount).toBe(0);
    expect(lease.rentDueDay).toBe(1);
    expect(lease.payments.map((payment) => payment.dueDate.toISOString())).toEqual([
      '2026-02-01T00:00:00.000Z',
      '2026-03-01T00:00:00.000Z',
      '2026-04-01T00:00:00.000Z',
    ]);
  });

  it('finds a lease by id and throws for unknown leases', async () => {
    const lease = await createLease();

    await expect(service.findOne(lease.id)).resolves.toEqual(lease);
    await expect(service.findOne('missing')).rejects.toThrow('Lease missing not found');
  });

  it('activates a draft lease and notifies the tenant', async () => {
    const lease = await createLease();

    const activated = await service.activate(lease.id);

    expect(activated.status).toBe(LeaseStatus.ACTIVE);
    expect(activated.activatedAt).toBeInstanceOf(Date);
    expect(notifications.sendNotification).toHaveBeenCalledWith(
      'tenant-1',
      'LEASE_ACTIVATED',
      'Your lease is now active',
      'RENTAL_MANAGEMENT',
      { leaseId: lease.id, propertyId: 'property-1' },
    );
    await expect(service.activate(lease.id)).rejects.toThrow(ConflictException);
  });

  it('rejects invalid rent payment amounts', async () => {
    const lease = await service.activate((await createLease()).id);

    await expect(service.recordPayment({ leaseId: lease.id, amount: Number.NaN })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.recordPayment({ leaseId: lease.id, amount: 0 })).rejects.toThrow(
      'Rent payment amount must be greater than zero',
    );
  });

  it('only records payments for active leases', async () => {
    const lease = await createLease();

    await expect(service.recordPayment({ leaseId: lease.id, amount: 2000 })).rejects.toThrow(
      'Rent can only be recorded for an active lease',
    );
  });

  it('tracks rent payments and defaults the payment date', async () => {
    const lease = await service.activate((await createLease()).id);

    const updated = await service.recordPayment({ leaseId: lease.id, amount: 2000 });

    expect(updated.payments[0].status).toBe(RentPaymentStatus.PAID);
    expect(updated.payments[0].paidAt).toBeInstanceOf(Date);
    expect(updated.payments[1].status).toBe(RentPaymentStatus.SCHEDULED);
    expect(notifications.sendNotification).toHaveBeenCalledWith(
      'tenant-1',
      'RENT_PAYMENT_RECORDED',
      'Your rent payment was recorded',
      'RENTAL_MANAGEMENT',
      { leaseId: lease.id, amount: 2000, propertyId: 'property-1' },
    );
  });

  it('records an overdue payment with an explicit date and reference', async () => {
    const lease = await service.activate((await createLease()).id);
    await service.detectOverdue(new Date('2026-02-15T00:00:00.000Z'));
    const paidAt = new Date('2026-02-20T00:00:00.000Z');

    const updated = await service.recordPayment({
      leaseId: lease.id,
      amount: 2000,
      paidAt,
      reference: 'ref-1',
    });

    expect(updated.payments[0]).toMatchObject({
      status: RentPaymentStatus.PAID,
      paidAt,
      reference: 'ref-1',
    });
  });

  it('rejects payment when no rent is outstanding', async () => {
    const lease = await service.activate((await createLease()).id);
    await service.recordPayment({ leaseId: lease.id, amount: 2000 });
    await service.recordPayment({ leaseId: lease.id, amount: 2000 });
    await service.recordPayment({ leaseId: lease.id, amount: 2000 });
    await service.recordPayment({ leaseId: lease.id, amount: 2000 });

    await expect(service.recordPayment({ leaseId: lease.id, amount: 2000 })).rejects.toThrow(
      'No outstanding rent payment for this lease',
    );
  });

  it('detects overdue rent, skips paid and already overdue entries, and notifies once', async () => {
    const lease = await service.activate((await createLease()).id);
    await service.recordPayment({
      leaseId: lease.id,
      amount: 2000,
      paidAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const asOf = new Date('2026-03-15T00:00:00.000Z');

    const changed = await service.detectOverdue(asOf);
    const repeated = await service.detectOverdue(asOf);

    expect(changed).toHaveLength(1);
    expect(changed[0].payments.map((payment) => payment.status)).toEqual([
      RentPaymentStatus.PAID,
      RentPaymentStatus.OVERDUE,
      RentPaymentStatus.OVERDUE,
      RentPaymentStatus.SCHEDULED,
    ]);
    expect(repeated).toEqual([]);
    expect(notifications.sendNotification).toHaveBeenCalledTimes(3);
    expect(notifications.sendNotification).toHaveBeenCalledWith(
      'tenant-1',
      'RENT_OVERDUE',
      '2 rent payment(s) are overdue',
      'RENTAL_MANAGEMENT',
      { leaseId: lease.id, overdueCount: 2, propertyId: 'property-1' },
    );
  });

  it('ignores draft leases and future due dates during overdue detection', async () => {
    await createLease();
    await service.activate(
      (
        await createLease({
          startDate: new Date('2027-01-01T00:00:00.000Z'),
          endDate: new Date('2027-04-01T00:00:00.000Z'),
        })
      ).id,
    );

    await expect(service.detectOverdue()).resolves.toEqual([]);
    expect(notifications.sendNotification).toHaveBeenCalledTimes(1);
  });

  it.each([30, 60, 90])('sends a single %i-day expiration alert', async (days) => {
    const lease = await service.activate((await createLease()).id);
    const asOf = new Date(END.getTime() - days * DAY_MS);

    const changed = await service.sendExpirationAlerts(asOf);
    const repeated = await service.sendExpirationAlerts(asOf);

    expect(changed).toHaveLength(1);
    expect(repeated).toEqual([]);
    expect(changed[0].alertsSent).toEqual([days]);
    expect(notifications.sendNotification).toHaveBeenCalledWith(
      'tenant-1',
      'LEASE_EXPIRING',
      `Your lease expires in ${days} days`,
      'RENTAL_MANAGEMENT',
      { leaseId: lease.id, daysRemaining: days, propertyId: 'property-1' },
    );
  });

  it('does not alert for non-expiring or non-active leases', async () => {
    await createLease();
    const lease = await service.activate((await createLease()).id);

    await expect(service.sendExpirationAlerts()).resolves.toEqual([]);
    expect(internals().leases.get(lease.id)?.alertsSent).toEqual([]);
  });

  it('terminates a lease with an explicit date and actor', async () => {
    const lease = await service.activate((await createLease()).id);
    const terminatedAt = new Date('2026-02-01T00:00:00.000Z');

    const result = await service.terminate({
      leaseId: lease.id,
      reason: 'Tenant moved out',
      actorId: 'landlord-1',
      terminatedAt,
    });

    expect(result).toMatchObject({
      status: LeaseStatus.TERMINATED,
      terminationReason: 'Tenant moved out',
      terminatedAt,
    });
    expect(notifications.sendNotification).toHaveBeenCalledWith(
      'tenant-1',
      'LEASE_TERMINATED',
      'Your lease was terminated: Tenant moved out',
      'RENTAL_MANAGEMENT',
      { leaseId: lease.id, actorId: 'landlord-1', propertyId: 'property-1' },
    );
    await expect(service.terminate({ leaseId: lease.id, reason: 'Again' })).rejects.toThrow(
      'Lease has already been terminated',
    );
  });

  it('defaults the termination date when none is supplied', async () => {
    const lease = await createLease();

    const result = await service.terminate({ leaseId: lease.id, reason: 'Not approved' });

    expect(result.terminatedAt).toBeInstanceOf(Date);
  });

  it('computes rental income for paid payments inside the reporting window', async () => {
    const lease = await service.activate((await createLease()).id);
    await service.recordPayment({
      leaseId: lease.id,
      amount: 2000.5,
      paidAt: new Date('2026-01-05T00:00:00.000Z'),
    });
    await service.recordPayment({
      leaseId: lease.id,
      amount: 2000,
      paidAt: new Date('2026-02-05T00:00:00.000Z'),
    });
    const otherProperty = await service.activate(
      (await createLease({ propertyId: 'property-2' })).id,
    );
    await service.recordPayment({
      leaseId: otherProperty.id,
      amount: 9000,
      paidAt: new Date('2026-01-06T00:00:00.000Z'),
    });

    const summary = await service.getRentalIncome(
      'property-1',
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-31T23:59:59.999Z'),
    );

    expect(summary).toEqual({
      propertyId: 'property-1',
      paymentCount: 1,
      totalAmount: 2000.5,
    });
  });

  it('excludes unpaid payments and payments outside the reporting window', async () => {
    const lease = await service.activate((await createLease()).id);
    await service.recordPayment({
      leaseId: lease.id,
      amount: 2000,
      paidAt: new Date('2025-12-01T00:00:00.000Z'),
    });
    await service.recordPayment({
      leaseId: lease.id,
      amount: 2000,
      paidAt: new Date('2026-02-05T00:00:00.000Z'),
    });
    const paidWithoutDate = internals().leases.get(lease.id)?.payments[2];
    if (paidWithoutDate) {
      paidWithoutDate.status = RentPaymentStatus.PAID;
      paidWithoutDate.paidAt = undefined;
    }

    const summary = await service.getRentalIncome(
      'property-1',
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-31T23:59:59.999Z'),
    );

    expect(summary.paymentCount).toBe(0);
    expect(summary.totalAmount).toBe(0);
  });
});
