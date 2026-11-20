// @ts-nocheck
/**
 * Typed fixture/data factory for commission split E2E coverage (issue #1575).
 *
 * These fixtures mirror the API exposed by
 * `api-extensions/modules/commission-split`:
 *   POST   /commission-splits
 *   GET    /commission-splits?transactionId=...
 *   GET    /commission-splits/:id
 *   PATCH  /commission-splits/:id
 *   POST   /commission-splits/:id/participants/:userId/payout
 *
 * The module currently keeps splits in an in-memory Map and generates split
 * ids with `randomUUID()`, so scenarios capture the id returned by POST and
 * substitute it into subsequent `:splitId` paths with `buildScenarioPath()`.
 * All ids below are RFC-4122 v4-shaped because the request DTOs use @IsUUID().
 *
 * This is a support module only: no executable spec files are added as part
 * of this change. See `api-extensions/tests/COMMISSION_SPLIT_TEST_PLAN.md`.
 */
import {
  PayoutStatus,
  SplitStatus,
} from '../../modules/commission-split/dto/commission-split.dto';

export { PayoutStatus, SplitStatus };

export const COMMISSION_SPLIT_ROUTES = {
  collection: '/commission-splits',
  byTransaction: (transactionId: string): string =>
    `/commission-splits?transactionId=${encodeURIComponent(transactionId)}`,
  byId: (splitId: string): string => `/commission-splits/${splitId}`,
  payout: (splitId: string, userId: string): string =>
    `/commission-splits/${splitId}/participants/${userId}/payout`,
} as const;

/** Stable UUIDs so request DTO validation passes and expectations stay readable. */
export const COMMISSION_SPLIT_IDS = {
  transactions: {
    primary: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    secondary: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  },
  participants: {
    listingAgent: '11111111-1111-4111-b111-111111111111',
    buyerAgent: '22222222-2222-4222-b222-222222222222',
    broker: '33333333-3333-4333-b333-333333333333',
    unknown: '99999999-9999-4999-b999-999999999999',
  },
} as const;

export interface ParticipantSeed {
  userId: string;
  role: string;
  splitPercentage: number;
}

export interface CommissionSplitSeed {
  transactionId: string;
  totalAmount: number;
  participants: ParticipantSeed[];
  tier?: string;
}

export interface InvalidSplitCase {
  name: string;
  payload: CommissionSplitSeed;
  /** Where the 400 originates: DTO ValidationPipe or the commission service. */
  rejectedBy: 'validation-pipe' | 'service';
  /** Exact service message, or a fragment of the class-validator message. */
  expectedMessage: string;
}

export interface PayoutStateFixture {
  name: string;
  splitStatus: SplitStatus;
  participants: Array<ParticipantSeed & { amount: number; payoutStatus: PayoutStatus }>;
}

export interface ExpectedStepResponse {
  statusCode: number;
  splitStatus?: SplitStatus;
  payoutStatuses?: PayoutStatus[];
  amounts?: number[];
  message?: string;
}

export interface ScenarioStep {
  name: string;
  method: 'GET' | 'POST' | 'PATCH';
  /** Paths may contain :splitId, :firstParticipantId or :secondParticipantId. */
  path: string;
  body?: unknown;
  expected: ExpectedStepResponse;
}

export interface LifecycleScenario {
  seed: CommissionSplitSeed;
  steps: ScenarioStep[];
}

export function buildParticipant(
  userId: string,
  role: string,
  splitPercentage: number,
): ParticipantSeed {
  return { userId, role, splitPercentage };
}

/** Default: 60/40 split of a 10,000 commission — totals exactly 100%. */
export function buildValidSplitSeed(overrides: Partial<CommissionSplitSeed> = {}): CommissionSplitSeed {
  const { listingAgent, buyerAgent } = COMMISSION_SPLIT_IDS.participants;
  return {
    transactionId: COMMISSION_SPLIT_IDS.transactions.primary,
    totalAmount: 10000,
    participants: [
      buildParticipant(listingAgent, 'LISTING_AGENT', 60),
      buildParticipant(buyerAgent, 'BUYER_AGENT', 40),
    ],
    tier: 'STANDARD',
    ...overrides,
  };
}

/** JSON-friendly POST /commission-splits body. */
export function buildValidSplitPayload(
  overrides: Partial<CommissionSplitSeed> = {},
): CommissionSplitSeed {
  return buildValidSplitSeed(overrides);
}

export function buildThreeWaySplitPayload(): CommissionSplitSeed {
  const { listingAgent, buyerAgent, broker } = COMMISSION_SPLIT_IDS.participants;
  return buildValidSplitPayload({
    totalAmount: 25000,
    participants: [
      buildParticipant(listingAgent, 'LISTING_AGENT', 50),
      buildParticipant(buyerAgent, 'BUYER_AGENT', 30),
      buildParticipant(broker, 'BROKER', 20),
    ],
  });
}

export function buildSingleRecipientSplitPayload(): CommissionSplitSeed {
  const { listingAgent } = COMMISSION_SPLIT_IDS.participants;
  return buildValidSplitPayload({
    participants: [buildParticipant(listingAgent, 'LISTING_AGENT', 100)],
  });
}

export function sumPercentages(payload: Pick<CommissionSplitSeed, 'participants'>): number {
  return payload.participants.reduce((total, item) => total + item.splitPercentage, 0);
}

/** Build a deliberately unvalidated split body from a list of percentages. */
export function buildSplitPayloadFromPercentages(
  percentages: number[],
  overrides: Partial<CommissionSplitSeed> = {},
): CommissionSplitSeed {
  const roles = ['LISTING_AGENT', 'BUYER_AGENT', 'BROKER', 'CONSULTANT'];
  const userIds = [
    COMMISSION_SPLIT_IDS.participants.listingAgent,
    COMMISSION_SPLIT_IDS.participants.buyerAgent,
    COMMISSION_SPLIT_IDS.participants.broker,
  ];
  return buildValidSplitPayload({
    ...overrides,
    participants: percentages.map((splitPercentage, index) =>
      buildParticipant(
        userIds[index % userIds.length],
        roles[index % roles.length],
        splitPercentage,
      ),
    ),
  });
}

const INVALID_PERCENTAGE_MESSAGE = 'Commission split percentages must total 100%';

/**
 * Parameterised 400 cases. The first three target the 100% rule directly;
 * the rest guard adjacent validation rules so a regression cannot be hidden
 * by an unrelated 201.
 */
export const INVALID_SPLIT_CASES: InvalidSplitCase[] = [
  {
    name: 'under-100',
    payload: buildSplitPayloadFromPercentages([60, 30]),
    rejectedBy: 'service',
    expectedMessage: INVALID_PERCENTAGE_MESSAGE,
  },
  {
    name: 'over-100',
    payload: buildSplitPayloadFromPercentages([60, 50]),
    rejectedBy: 'service',
    expectedMessage: INVALID_PERCENTAGE_MESSAGE,
  },
  {
    name: 'floating-point-under-100',
    payload: buildSplitPayloadFromPercentages([33.33, 33.33, 33.33]),
    rejectedBy: 'service',
    expectedMessage: INVALID_PERCENTAGE_MESSAGE,
  },
  {
    name: 'negative-percentage',
    payload: buildSplitPayloadFromPercentages([-10, 110]),
    rejectedBy: 'validation-pipe',
    expectedMessage: 'splitPercentage must not be less than 0',
  },
  {
    name: 'percentage-above-100',
    payload: buildSplitPayloadFromPercentages([120, -20]),
    rejectedBy: 'validation-pipe',
    expectedMessage: 'splitPercentage must not be greater than 100',
  },
  {
    name: 'duplicate-participants',
    payload: buildValidSplitPayload({
      participants: [
        buildParticipant(
          COMMISSION_SPLIT_IDS.participants.listingAgent,
          'LISTING_AGENT',
          50,
        ),
        buildParticipant(
          COMMISSION_SPLIT_IDS.participants.listingAgent,
          'BROKER',
          50,
        ),
      ],
    }),
    rejectedBy: 'service',
    expectedMessage: 'Commission participants must be unique',
  },
  {
    name: 'zero-total-amount',
    payload: buildValidSplitPayload({ totalAmount: 0 }),
    rejectedBy: 'service',
    expectedMessage: 'Commission total amount must be greater than zero',
  },
  {
    name: 'empty-participants',
    payload: buildValidSplitPayload({ participants: [] }),
    rejectedBy: 'validation-pipe',
    expectedMessage: 'participants should not be empty',
  },
];

/** Mirrors the service's amount calculation (2-decimal rounding). */
export function expectedParticipantAmount(totalAmount: number, splitPercentage: number): number {
  return Number(((totalAmount * splitPercentage) / 100).toFixed(2));
}

export function buildPayoutStateFixture(
  name: string,
  percentages: number[],
  payoutStatuses: PayoutStatus[],
  totalAmount = 10000,
): PayoutStateFixture {
  const seed = buildSplitPayloadFromPercentages(percentages, { totalAmount });
  return {
    name,
    splitStatus:
      payoutStatuses.length > 0 && payoutStatuses.every((status) => status === PayoutStatus.PAID)
        ? SplitStatus.PAID
        : payoutStatuses.some((status) => status === PayoutStatus.DISPUTED)
          ? SplitStatus.DISPUTED
          : SplitStatus.PENDING,
    participants: seed.participants.map((participant, index) => ({
      ...participant,
      amount: expectedParticipantAmount(totalAmount, participant.splitPercentage),
      payoutStatus: payoutStatuses[index],
    })),
  };
}

/** Expected payout state after each POST .../payout call in the lifecycle. */
export const PAYOUT_STATE_FIXTURES = {
  ALL_PENDING: buildPayoutStateFixture(
    'all-pending',
    [60, 40],
    [PayoutStatus.PENDING, PayoutStatus.PENDING],
  ),
  FIRST_PAID: buildPayoutStateFixture(
    'first-participant-paid',
    [60, 40],
    [PayoutStatus.PAID, PayoutStatus.PENDING],
  ),
  ALL_PAID: buildPayoutStateFixture(
    'all-participants-paid',
    [60, 40],
    [PayoutStatus.PAID, PayoutStatus.PAID],
  ),
} as const;

export const UPDATE_STATUS_PAYLOADS = {
  approved: { status: SplitStatus.APPROVED },
  paid: { status: SplitStatus.PAID },
  disputed: { status: SplitStatus.DISPUTED },
  adjustment: { adjustment: 500 },
} as const;

export const DISPUTE_PATCH_PAYLOAD = UPDATE_STATUS_PAYLOADS.disputed;
export const DISPUTED_PAYOUT_ERROR = 'Cannot pay a disputed commission split';
export const SPLIT_NOT_FOUND_ERROR = (splitId: string): string =>
  `Commission split ${splitId} not found`;
export const PARTICIPANT_NOT_FOUND_ERROR = (userId: string): string =>
  `Participant ${userId} not found in commission split`;

export function buildDisputedSplitFixture(totalAmount = 10000): PayoutStateFixture {
  return buildPayoutStateFixture(
    'disputed-split',
    [60, 40],
    [PayoutStatus.DISPUTED, PayoutStatus.DISPUTED],
    totalAmount,
  );
}

/**
 * Ordered end-to-end scenario. The adjustment intentionally comes before the
 * payouts: the service recalculates participant amounts on adjustment and
 * resets every payout to PENDING.
 */
export const COMMISSION_SPLIT_LIFECYCLE: LifecycleScenario = {
  seed: buildValidSplitPayload(),
  steps: [
    {
      name: 'create-split',
      method: 'POST',
      path: COMMISSION_SPLIT_ROUTES.collection,
      body: buildValidSplitPayload(),
      expected: {
        statusCode: 201,
        splitStatus: SplitStatus.PENDING,
        payoutStatuses: [PayoutStatus.PENDING, PayoutStatus.PENDING],
        amounts: [6000, 4000],
      },
    },
    {
      name: 'retrieve-by-transaction',
      method: 'GET',
      path: COMMISSION_SPLIT_ROUTES.byTransaction(COMMISSION_SPLIT_IDS.transactions.primary),
      expected: { statusCode: 200 },
    },
    {
      name: 'retrieve-by-id',
      method: 'GET',
      path: COMMISSION_SPLIT_ROUTES.byId(':splitId'),
      expected: {
        statusCode: 200,
        splitStatus: SplitStatus.PENDING,
        payoutStatuses: [PayoutStatus.PENDING, PayoutStatus.PENDING],
        amounts: [6000, 4000],
      },
    },
    {
      name: 'apply-adjustment',
      method: 'PATCH',
      path: COMMISSION_SPLIT_ROUTES.byId(':splitId'),
      body: UPDATE_STATUS_PAYLOADS.adjustment,
      expected: {
        statusCode: 200,
        splitStatus: SplitStatus.PENDING,
        payoutStatuses: [PayoutStatus.PENDING, PayoutStatus.PENDING],
        amounts: [6300, 4200],
      },
    },
    {
      name: 'pay-first-participant',
      method: 'POST',
      path: COMMISSION_SPLIT_ROUTES.payout(':splitId', ':firstParticipantId'),
      expected: {
        statusCode: 201,
        splitStatus: SplitStatus.PENDING,
        payoutStatuses: [PayoutStatus.PAID, PayoutStatus.PENDING],
      },
    },
    {
      name: 'pay-second-participant',
      method: 'POST',
      path: COMMISSION_SPLIT_ROUTES.payout(':splitId', ':secondParticipantId'),
      expected: {
        statusCode: 201,
        splitStatus: SplitStatus.PAID,
        payoutStatuses: [PayoutStatus.PAID, PayoutStatus.PAID],
      },
    },
    {
      name: 'mark-disputed',
      method: 'PATCH',
      path: COMMISSION_SPLIT_ROUTES.byId(':splitId'),
      body: DISPUTE_PATCH_PAYLOAD,
      expected: {
        statusCode: 200,
        splitStatus: SplitStatus.DISPUTED,
        payoutStatuses: [PayoutStatus.DISPUTED, PayoutStatus.DISPUTED],
      },
    },
    {
      name: 'payout-blocked-while-disputed',
      method: 'POST',
      path: COMMISSION_SPLIT_ROUTES.payout(':splitId', ':firstParticipantId'),
      body: undefined,
      expected: { statusCode: 400, message: DISPUTED_PAYOUT_ERROR },
    },
  ],
};

export interface ScenarioPathVars {
  splitId: string;
  firstParticipantId?: string;
  secondParticipantId?: string;
}

/** Replace the placeholder tokens in a lifecycle step path with runtime ids. */
export function buildScenarioPath(path: string, vars: ScenarioPathVars): string {
  return path
    .replace(':splitId', encodeURIComponent(vars.splitId))
    .replace(':firstParticipantId', encodeURIComponent(vars.firstParticipantId ?? ''))
    .replace(':secondParticipantId', encodeURIComponent(vars.secondParticipantId ?? ''));
}

/** Fresh deep copy so one scenario run cannot mutate another. */
export function buildLifecycleScenario(): LifecycleScenario {
  return JSON.parse(JSON.stringify(COMMISSION_SPLIT_LIFECYCLE)) as LifecycleScenario;
}
