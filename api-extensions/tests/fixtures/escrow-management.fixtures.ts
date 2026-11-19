/**
 * Non-test fixture/data-factory support for issue #1572 (Escrow Management).
 *
 * Support artifact only: no Jest globals, no *.spec.ts / *.test.ts files.
 * Intended for future supertest e2e tests that walk the complete escrow
 * lifecycle: create -> hold funds -> conditionally release (or refund).
 *
 * Determinism: fixed ids, amounts and ISO timestamps; every factory returns a
 * fresh object. No Math.random(), crypto.randomUUID() or current-clock dates.
 */

export type EscrowStatus = 'PENDING' | 'HELD' | 'RELEASED' | 'REFUNDED';
export type EscrowConditionType = 'DOCUMENTS_VERIFIED' | 'INSPECTION_PASSED' | 'TITLE_TRANSFERRED';
export type EscrowAuditAction =
  | 'CREATED'
  | 'FUNDS_HELD'
  | 'CONDITION_MET'
  | 'RELEASED'
  | 'REFUNDED'
  | 'RELEASE_REJECTED';
export type RefundReason = 'BUYER_WITHDREW' | 'FAILED_INSPECTION' | 'MUTUAL_AGREEMENT';

export interface EscrowCondition {
  id: string;
  type: EscrowConditionType;
  description: string;
  met: boolean;
}

/** Body of POST /escrows. */
export interface CreateEscrowRequest {
  transactionId: string;
  amount: number;
  currency: 'USD';
  buyerId: string;
  sellerId: string;
  conditions: EscrowCondition[];
}

/** Body of POST /escrows/:id/release. */
export interface ReleaseEscrowRequest {
  conditionIds: string[];
  note?: string;
}

/** Body of POST /escrows/:id/refund. */
export interface RefundEscrowRequest {
  reason: RefundReason;
  note?: string;
}

export interface EscrowRecord {
  id: string;
  transactionId: string;
  amount: number;
  currency: 'USD';
  status: EscrowStatus;
  buyerId: string;
  sellerId: string;
  conditions: EscrowCondition[];
  createdAt: string;
  updatedAt: string;
  releasedAt?: string;
  refundedAt?: string;
}

export interface EscrowAuditEntry {
  id: string;
  escrowId: string;
  action: EscrowAuditAction;
  actorId: string;
  at: string;
  details: Record<string, unknown>;
}

export interface LifecycleStep {
  name: string;
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  body?: Record<string, unknown>;
  expectedStatus: number;
  expectedEscrowStatus?: EscrowStatus;
  expectedAuditAction?: EscrowAuditAction;
}

export const ESCROW_IDS = {
  escrowId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  transactionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  buyerId: '11111111-1111-4111-a111-111111111111',
  sellerId: '22222222-2222-4222-b222-222222222222',
  agentId: '33333333-3333-4333-b333-333333333333',
  documentsConditionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  inspectionConditionId: 'cccccccc-cccc-4ccc-8ccc-cccccccc0002',
  titleConditionId: 'cccccccc-cccc-4ccc-8ccc-cccccccc0003',
} as const;

export const ESCROW_TIMES = {
  createdAt: '2026-06-01T10:00:00.000Z',
  heldAt: '2026-06-01T10:05:00.000Z',
  conditionMetAt: '2026-06-10T12:00:00.000Z',
  releasedAt: '2026-06-11T09:30:00.000Z',
  refundedAt: '2026-06-12T14:00:00.000Z',
} as const;

export const ESCROW_AMOUNT = 250000;

export function escrowCondition(
  overrides: Partial<EscrowCondition> = {},
): EscrowCondition {
  return {
    id: ESCROW_IDS.documentsConditionId,
    type: 'DOCUMENTS_VERIFIED',
    description: 'All closing documents verified by the title agent',
    met: false,
    ...overrides,
  };
}

export function defaultConditions(): EscrowCondition[] {
  return [
    escrowCondition(),
    escrowCondition({
      id: ESCROW_IDS.inspectionConditionId,
      type: 'INSPECTION_PASSED',
      description: 'Property inspection passed with no unresolved defects',
    }),
    escrowCondition({
      id: ESCROW_IDS.titleConditionId,
      type: 'TITLE_TRANSFERRED',
      description: 'Title transferred to the buyer',
    }),
  ];
}

export function createEscrowRequest(
  overrides: Partial<CreateEscrowRequest> = {},
): CreateEscrowRequest {
  return {
    transactionId: ESCROW_IDS.transactionId,
    amount: ESCROW_AMOUNT,
    currency: 'USD',
    buyerId: ESCROW_IDS.buyerId,
    sellerId: ESCROW_IDS.sellerId,
    conditions: defaultConditions(),
    ...overrides,
  };
}

export function escrowRecord(overrides: Partial<EscrowRecord> = {}): EscrowRecord {
  return {
    id: ESCROW_IDS.escrowId,
    transactionId: ESCROW_IDS.transactionId,
    amount: ESCROW_AMOUNT,
    currency: 'USD',
    status: 'PENDING',
    buyerId: ESCROW_IDS.buyerId,
    sellerId: ESCROW_IDS.sellerId,
    conditions: defaultConditions(),
    createdAt: ESCROW_TIMES.createdAt,
    updatedAt: ESCROW_TIMES.createdAt,
    ...overrides,
  };
}

/** Snapshot after funds have been deposited and held. */
export function heldEscrow(overrides: Partial<EscrowRecord> = {}): EscrowRecord {
  return escrowRecord({
    status: 'HELD',
    updatedAt: ESCROW_TIMES.heldAt,
    ...overrides,
  });
}

/** Release request that satisfies every configured condition. */
export function releaseWithValidConditions(
  overrides: Partial<ReleaseEscrowRequest> = {},
): ReleaseEscrowRequest {
  return {
    conditionIds: defaultConditions().map((condition) => condition.id),
    note: 'All closing conditions satisfied',
    ...overrides,
  };
}

/** Release request missing a required condition; used for the 4xx path. */
export function releaseWithMissingConditions(): ReleaseEscrowRequest {
  return releaseWithValidConditions({
    conditionIds: [ESCROW_IDS.documentsConditionId],
    note: 'Inspection and title conditions not met yet',
  });
}

export function refundRequest(overrides: Partial<RefundEscrowRequest> = {}): RefundEscrowRequest {
  return {
    reason: 'FAILED_INSPECTION',
    note: 'Inspection revealed unresolved structural defects',
    ...overrides,
  };
}

export function releasedEscrow(overrides: Partial<EscrowRecord> = {}): EscrowRecord {
  return escrowRecord({
    status: 'RELEASED',
    updatedAt: ESCROW_TIMES.releasedAt,
    releasedAt: ESCROW_TIMES.releasedAt,
    conditions: defaultConditions().map((condition) => ({ ...condition, met: true })),
    ...overrides,
  });
}

export function refundedEscrow(overrides: Partial<EscrowRecord> = {}): EscrowRecord {
  return escrowRecord({
    status: 'REFUNDED',
    updatedAt: ESCROW_TIMES.refundedAt,
    refundedAt: ESCROW_TIMES.refundedAt,
    ...overrides,
  });
}

/** Expected error for a second release attempt on an already-released escrow. */
export const DOUBLE_RELEASE_ERROR = {
  status: 409,
  body: {
    statusCode: 409,
    message: 'Escrow has already been released',
    error: 'Conflict',
  },
} as const;

/**
 * Complete audit trail for a successful lifecycle. Entries are ordered by time
 * so a test can assert both the actions and the ordering.
 */
export function escrowAuditTrail(escrowId: string = ESCROW_IDS.escrowId): EscrowAuditEntry[] {
  return [
    {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddd0001',
      escrowId,
      action: 'CREATED',
      actorId: ESCROW_IDS.agentId,
      at: ESCROW_TIMES.createdAt,
      details: { transactionId: ESCROW_IDS.transactionId, amount: ESCROW_AMOUNT },
    },
    {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddd0002',
      escrowId,
      action: 'FUNDS_HELD',
      actorId: ESCROW_IDS.buyerId,
      at: ESCROW_TIMES.heldAt,
      details: { amount: ESCROW_AMOUNT, currency: 'USD' },
    },
    {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddd0003',
      escrowId,
      action: 'CONDITION_MET',
      actorId: ESCROW_IDS.agentId,
      at: ESCROW_TIMES.conditionMetAt,
      details: { conditionId: ESCROW_IDS.documentsConditionId },
    },
    {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddd0004',
      escrowId,
      action: 'RELEASED',
      actorId: ESCROW_IDS.agentId,
      at: ESCROW_TIMES.releasedAt,
      details: { amount: ESCROW_AMOUNT, recipientId: ESCROW_IDS.sellerId },
    },
  ];
}

/** Ordered HTTP steps for a full create -> hold -> release lifecycle e2e test. */
export function escrowLifecycleSteps(): LifecycleStep[] {
  const id = ESCROW_IDS.escrowId;
  return [
    {
      name: 'create escrow for transaction',
      method: 'POST',
      path: '/escrows',
      body: createEscrowRequest() as unknown as Record<string, unknown>,
      expectedStatus: 201,
      expectedEscrowStatus: 'PENDING',
      expectedAuditAction: 'CREATED',
    },
    {
      name: 'hold funds',
      method: 'POST',
      path: `/escrows/${id}/hold`,
      body: { amount: ESCROW_AMOUNT } as Record<string, unknown>,
      expectedStatus: 201,
      expectedEscrowStatus: 'HELD',
      expectedAuditAction: 'FUNDS_HELD',
    },
    {
      name: 'release with valid conditions',
      method: 'POST',
      path: `/escrows/${id}/release`,
      body: releaseWithValidConditions() as unknown as Record<string, unknown>,
      expectedStatus: 201,
      expectedEscrowStatus: 'RELEASED',
      expectedAuditAction: 'RELEASED',
    },
    {
      name: 'read audit trail',
      method: 'GET',
      path: `/escrows/${id}/audit`,
      expectedStatus: 200,
    },
  ];
}

/** Ordered HTTP steps for the refund branch of the lifecycle. */
export function escrowRefundSteps(): LifecycleStep[] {
  const id = ESCROW_IDS.escrowId;
  return [
    {
      name: 'create escrow',
      method: 'POST',
      path: '/escrows',
      body: createEscrowRequest() as unknown as Record<string, unknown>,
      expectedStatus: 201,
      expectedEscrowStatus: 'PENDING',
    },
    {
      name: 'hold funds',
      method: 'POST',
      path: `/escrows/${id}/hold`,
      body: { amount: ESCROW_AMOUNT } as Record<string, unknown>,
      expectedStatus: 201,
      expectedEscrowStatus: 'HELD',
    },
    {
      name: 'refund buyer',
      method: 'POST',
      path: `/escrows/${id}/refund`,
      body: refundRequest() as unknown as Record<string, unknown>,
      expectedStatus: 201,
      expectedEscrowStatus: 'REFUNDED',
      expectedAuditAction: 'REFUNDED',
    },
  ];
}

export function escrowScenario() {
  return {
    createRequest: createEscrowRequest(),
    pending: escrowRecord(),
    held: heldEscrow(),
    release: releaseWithValidConditions(),
    invalidRelease: releaseWithMissingConditions(),
    released: releasedEscrow(),
    refund: refundRequest(),
    refunded: refundedEscrow(),
    auditTrail: escrowAuditTrail(),
    doubleReleaseError: DOUBLE_RELEASE_ERROR,
    lifecycle: escrowLifecycleSteps(),
    refundLifecycle: escrowRefundSteps(),
  };
}
