/**
 * Non-test fixture/data-factory support for issue #1573 (Rental Management).
 *
 * Support artifact only: no Jest globals and no *.spec.ts / *.test.ts files.
 * Future supertest e2e tests can use these factories for lease creation, rent
 * payments, overdue/expiration alerts, termination and income-summary checks.
 *
 * Determinism: fixed ids, amounts and ISO dates. Time-relative fixtures derive
 * from fixed "as of" dates, never from the system clock. No Math.random().
 * Each factory returns a fresh object so tests can safely mutate their copy.
 */

export type LeaseStatus = 'DRAFT' | 'ACTIVE' | 'TERMINATED';
export type RentPaymentStatus = 'PAID' | 'PENDING' | 'OVERDUE';
export type RentPaymentMethod = 'BANK_TRANSFER' | 'CARD' | 'CASH';

/** Body of POST /leases. */
export interface CreateLeaseRequest {
  propertyId: string;
  tenantId: string;
  landlordId: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  depositAmount: number;
  rentDueDay: number;
}

/** Body of POST /leases/:id/payments. */
export interface RecordRentPaymentRequest {
  leaseId: string;
  amount: number;
  paidAt: string;
  method: RentPaymentMethod;
  reference?: string;
}

/** Body of POST /leases/:id/terminate. */
export interface TerminateLeaseRequest {
  reason: 'EARLY_TERMINATION' | 'MUTUAL_AGREEMENT' | 'NON_PAYMENT';
  effectiveDate: string;
  note?: string;
}

export interface LeaseRecord {
  id: string;
  propertyId: string;
  tenantId: string;
  landlordId: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  depositAmount: number;
  rentDueDay: number;
  status: LeaseStatus;
  createdAt: string;
  terminatedAt?: string;
}

export interface RentPaymentRecord {
  id: string;
  leaseId: string;
  amount: number;
  paidAt: string;
  method: RentPaymentMethod;
  reference: string;
  status: RentPaymentStatus;
}

export interface RentAlertExpectation {
  type: 'RENT_OVERDUE' | 'LEASE_EXPIRING';
  leaseId: string;
  tenantId: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  amountDue?: number;
  daysOverdue?: number;
  daysUntilExpiration?: number;
}

export interface ExpirationAlertCase {
  daysUntilExpiration: number;
  lease: LeaseRecord;
  expectedAlert: RentAlertExpectation | null;
}

export interface IncomeSummaryExpectation {
  leaseId: string;
  currency: 'USD';
  period: { from: string; to: string };
  monthlyRent: number;
  paidCount: number;
  overdueCount: number;
  totalCollected: number;
  outstandingAmount: number;
}

export interface LifecycleStep {
  name: string;
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  body?: Record<string, unknown>;
  expectedStatus: number;
  expectedLeaseStatus?: LeaseStatus;
  expectedAlertType?: RentAlertExpectation['type'];
}

export const RENTAL_IDS = {
  leaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  propertyId: '33333333-3333-4333-b333-333333333333',
  tenantId: '11111111-1111-4111-a111-111111111111',
  landlordId: '22222222-2222-4222-b222-222222222222',
  paymentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
} as const;

export const RENTAL_DATES = {
  leaseStart: '2026-01-01',
  leaseEnd: '2027-01-01',
  createdAt: '2026-01-01T09:00:00.000Z',
  expirationAsOf: '2026-06-01',
  overdueAsOf: '2026-06-20',
  juneRentDue: '2026-06-05',
  terminationEffectiveDate: '2026-09-30',
} as const;

export const MONTHLY_RENT = 2500;
export const SECURITY_DEPOSIT = 2500;
export const RENT_DUE_DAY = 5;

/** Add whole UTC days to a YYYY-MM-DD string. Pure and deterministic. */
export function datePlusDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole days from `fromIso` to `toIso`, both YYYY-MM-DD. */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00.000Z`);
  const to = Date.parse(`${toIso}T00:00:00.000Z`);
  return Math.round((to - from) / 86_400_000);
}

function leaseIdForOffset(days: number): string {
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(days).padStart(12, '0')}`;
}

export function createLeaseRequest(overrides: Partial<CreateLeaseRequest> = {}): CreateLeaseRequest {
  return {
    propertyId: RENTAL_IDS.propertyId,
    tenantId: RENTAL_IDS.tenantId,
    landlordId: RENTAL_IDS.landlordId,
    startDate: RENTAL_DATES.leaseStart,
    endDate: RENTAL_DATES.leaseEnd,
    monthlyRent: MONTHLY_RENT,
    depositAmount: SECURITY_DEPOSIT,
    rentDueDay: RENT_DUE_DAY,
    ...overrides,
  };
}

export function leaseRecord(overrides: Partial<LeaseRecord> = {}): LeaseRecord {
  return {
    id: RENTAL_IDS.leaseId,
    propertyId: RENTAL_IDS.propertyId,
    tenantId: RENTAL_IDS.tenantId,
    landlordId: RENTAL_IDS.landlordId,
    startDate: RENTAL_DATES.leaseStart,
    endDate: RENTAL_DATES.leaseEnd,
    monthlyRent: MONTHLY_RENT,
    depositAmount: SECURITY_DEPOSIT,
    rentDueDay: RENT_DUE_DAY,
    status: 'ACTIVE',
    createdAt: RENTAL_DATES.createdAt,
    ...overrides,
  };
}

export function rentPaymentRequest(
  overrides: Partial<RecordRentPaymentRequest> = {},
): RecordRentPaymentRequest {
  return {
    leaseId: RENTAL_IDS.leaseId,
    amount: MONTHLY_RENT,
    paidAt: '2026-05-05',
    method: 'BANK_TRANSFER',
    reference: 'PAY-2026-05',
    ...overrides,
  };
}

export function rentPaymentRecord(
  overrides: Partial<RentPaymentRecord> = {},
): RentPaymentRecord {
  return {
    id: RENTAL_IDS.paymentId,
    leaseId: RENTAL_IDS.leaseId,
    amount: MONTHLY_RENT,
    paidAt: '2026-05-05',
    method: 'BANK_TRANSFER',
    reference: 'PAY-2026-05',
    status: 'PAID',
    ...overrides,
  };
}

/** Five on-time payments (January through May 2026) for the income summary. */
export function paidRentPayments(leaseId: string = RENTAL_IDS.leaseId): RentPaymentRecord[] {
  const months = ['01', '02', '03', '04', '05'];
  return months.map((month, index) =>
    rentPaymentRecord({
      id: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb${String(index + 1).padStart(4, '0')}`,
      leaseId,
      paidAt: `2026-${month}-05`,
      reference: `PAY-2026-${month}`,
    }),
  );
}

/** June 2026 rent is unpaid as of 2026-06-20: 15 days overdue. */
export function overdueScenario() {
  const daysOverdue = daysBetween(RENTAL_DATES.juneRentDue, RENTAL_DATES.overdueAsOf);
  const payments = paidRentPayments();
  return {
    asOf: RENTAL_DATES.overdueAsOf,
    lease: leaseRecord(),
    lastPaidPayment: payments[payments.length - 1] ?? rentPaymentRecord(),
    dueDate: RENTAL_DATES.juneRentDue,
    daysOverdue,
    expectedAlert: {
      type: 'RENT_OVERDUE' as const,
      leaseId: RENTAL_IDS.leaseId,
      tenantId: RENTAL_IDS.tenantId,
      severity: 'HIGH' as const,
      amountDue: MONTHLY_RENT,
      daysOverdue,
    },
  };
}

/**
 * Expiration alert cases measured from the fixed as-of date 2026-06-01.
 * 30/60/90 days must alert; 120 days is the negative control.
 */
export function expirationAlertCases(): ExpirationAlertCase[] {
  const offsets = [30, 60, 90, 120];
  return offsets.map((days) => {
    const lease = leaseRecord({
      id: leaseIdForOffset(days),
      endDate: datePlusDays(RENTAL_DATES.expirationAsOf, days),
    });
    const expectedAlert: RentAlertExpectation | null =
      days > 90
        ? null
        : {
            type: 'LEASE_EXPIRING',
            leaseId: lease.id,
            tenantId: RENTAL_IDS.tenantId,
            severity: days <= 30 ? 'HIGH' : days <= 60 ? 'MEDIUM' : 'LOW',
            daysUntilExpiration: days,
          };
    return { daysUntilExpiration: days, lease, expectedAlert };
  });
}

export function terminateLeaseRequest(
  overrides: Partial<TerminateLeaseRequest> = {},
): TerminateLeaseRequest {
  return {
    reason: 'EARLY_TERMINATION',
    effectiveDate: RENTAL_DATES.terminationEffectiveDate,
    note: 'Tenant relocating for work',
    ...overrides,
  };
}

export function terminatedLease(overrides: Partial<LeaseRecord> = {}): LeaseRecord {
  return leaseRecord({
    status: 'TERMINATED',
    terminatedAt: `${RENTAL_DATES.terminationEffectiveDate}T12:00:00.000Z`,
    ...overrides,
  });
}

/** Expected GET /leases/:id/income-summary response for the five paid fixtures. */
export const RENTAL_INCOME_SUMMARY: IncomeSummaryExpectation = {
  leaseId: RENTAL_IDS.leaseId,
  currency: 'USD',
  period: { from: RENTAL_DATES.leaseStart, to: RENTAL_DATES.overdueAsOf },
  monthlyRent: MONTHLY_RENT,
  paidCount: 5,
  overdueCount: 1,
  totalCollected: 5 * MONTHLY_RENT,
  outstandingAmount: MONTHLY_RENT,
};

/** Ordered HTTP steps for a full lease lifecycle e2e test. */
export function rentalLifecycleSteps(): LifecycleStep[] {
  const id = RENTAL_IDS.leaseId;
  return [
    {
      name: 'create lease',
      method: 'POST',
      path: '/leases',
      body: createLeaseRequest() as unknown as Record<string, unknown>,
      expectedStatus: 201,
      expectedLeaseStatus: 'ACTIVE',
    },
    {
      name: 'record rent payment',
      method: 'POST',
      path: `/leases/${id}/payments`,
      body: rentPaymentRequest() as unknown as Record<string, unknown>,
      expectedStatus: 201,
    },
    {
      name: 'check rent alerts',
      method: 'GET',
      path: `/leases/${id}/alerts?asOf=${RENTAL_DATES.overdueAsOf}`,
      expectedStatus: 200,
      expectedAlertType: 'RENT_OVERDUE',
    },
    {
      name: 'read income summary',
      method: 'GET',
      path: `/leases/${id}/income-summary`,
      expectedStatus: 200,
    },
    {
      name: 'terminate lease',
      method: 'POST',
      path: `/leases/${id}/terminate`,
      body: terminateLeaseRequest() as unknown as Record<string, unknown>,
      expectedStatus: 201,
      expectedLeaseStatus: 'TERMINATED',
    },
  ];
}

export function rentalScenario() {
  return {
    createRequest: createLeaseRequest(),
    lease: leaseRecord(),
    paymentRequest: rentPaymentRequest(),
    payment: rentPaymentRecord(),
    paidPayments: paidRentPayments(),
    overdue: overdueScenario(),
    expirationCases: expirationAlertCases(),
    terminateRequest: terminateLeaseRequest(),
    terminated: terminatedLease(),
    incomeSummary: RENTAL_INCOME_SUMMARY,
    lifecycle: rentalLifecycleSteps(),
  };
}
