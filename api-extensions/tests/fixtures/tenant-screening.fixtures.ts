/**
 * Non-test fixture/data-factory support for issue #1574 (Tenant Screening).
 *
 * Support artifact only: no Jest globals, no *.spec.ts / *.test.ts files.
 * Intended for future supertest e2e tests of POST /tenant-screenings,
 * GET /tenant-screenings/:id and POST /tenant-screenings/:id/process.
 *
 * The expected scores below are fixed values produced by the deterministic
 * sha256(email)-seeded scoring algorithm in
 * api-extensions/modules/tenant-screening/tenant-screening.service.ts. They let
 * tests assert exact results without reimplementing the algorithm in the test.
 *
 * Determinism: fixed ids, dates and payloads; no Math.random(), no
 * crypto.randomUUID() and no current-clock dates. Factories return fresh
 * objects so tests can safely mutate their copy.
 */

export type ScreeningStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
export type ScreeningRecommendation = 'APPROVE' | 'CONDITIONAL' | 'DENY';
export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

/** Body of POST /tenant-screenings. */
export interface CreateScreeningRequest {
  applicantName: string;
  applicantEmail: string;
  propertyId: string;
  monthlyIncome: number;
  monthlyRent: number;
  consent: boolean;
  optOut?: boolean;
}

export interface RiskFactorExpectation {
  factor: string;
  severity: RiskSeverity;
  description: string;
}

/** Response of POST /tenant-screenings/:id/process and GET /tenant-screenings/:id. */
export interface ScreeningResult {
  id: string;
  propertyId: string;
  status: ScreeningStatus;
  creditScore?: number;
  backgroundStatus?: string;
  incomeVerified?: boolean;
  overallScore?: number;
  recommendation?: ScreeningRecommendation;
  riskFactors?: RiskFactorExpectation[];
  createdAt: string;
  completedAt?: string;
}

export interface ScreeningCase {
  key: 'approve' | 'conditional' | 'deny' | 'optOut' | 'backgroundReview';
  request: CreateScreeningRequest;
  expected: ScreeningResult;
}

export interface InvalidApplicantCase {
  name: string;
  payload: Record<string, unknown>;
  reason: string;
}

export const SCREENING_IDS = {
  propertyId: '33333333-3333-4333-b333-333333333333',
  screeningId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  denyScreeningId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
} as const;

export const SCREENING_DATES = {
  createdAt: '2026-06-01T09:00:00.000Z',
  completedAt: '2026-06-01T09:01:00.000Z',
} as const;

export const APPLICANTS = {
  approve: {
    name: 'Alex Retry',
    email: 'alex.retry@example.com',
    monthlyIncome: 9000,
    monthlyRent: 3000,
  },
  conditional: {
    name: 'Jordan Conditional',
    email: 'jordan.conditional@example.com',
    monthlyIncome: 7500,
    monthlyRent: 3000,
  },
  deny: {
    name: 'Devon Deny',
    email: 'devon.deny@example.com',
    monthlyIncome: 3000,
    monthlyRent: 3000,
  },
  optOut: {
    name: 'Skyler Privacy',
    email: 'skyler.privacy@example.com',
    monthlyIncome: 10000,
    monthlyRent: 2500,
  },
  backgroundReview: {
    name: 'Riley Background',
    email: 'riley.background@example.com',
    monthlyIncome: 12000,
    monthlyRent: 3000,
  },
} as const;

export const RISK_FACTORS = {
  creditScore: {
    factor: 'credit_score',
    severity: 'HIGH',
    description: 'Credit score is below the preferred threshold',
  },
  incomeVerification: {
    factor: 'income_verification',
    severity: 'MEDIUM',
    description: 'Income does not meet the 2.5x rent guideline',
  },
  backgroundCheck: {
    factor: 'background_check',
    severity: 'HIGH',
    description: 'Background check requires manual review',
  },
  rentToIncome: {
    factor: 'rent_to_income',
    severity: 'MEDIUM',
    description: 'Rent consumes more than 40% of monthly income',
  },
} as const;

export const PRIVACY_OPT_OUT = {
  redactedName: 'REDACTED',
  redactedEmail: 'redacted@example.invalid',
  /** Response DTOs must never expose applicant PII, even after processing. */
  mustNotExposeFields: ['applicantName', 'applicantEmail', 'monthlyIncome', 'monthlyRent', 'optOut'],
} as const;

export function createScreeningRequest(
  overrides: Partial<CreateScreeningRequest> = {},
): CreateScreeningRequest {
  const applicant = APPLICANTS.approve;
  return {
    applicantName: applicant.name,
    applicantEmail: applicant.email,
    propertyId: SCREENING_IDS.propertyId,
    monthlyIncome: applicant.monthlyIncome,
    monthlyRent: applicant.monthlyRent,
    consent: true,
    ...overrides,
  };
}

export function pendingScreening(
  overrides: Partial<ScreeningResult> = {},
): ScreeningResult {
  return {
    id: SCREENING_IDS.screeningId,
    propertyId: SCREENING_IDS.propertyId,
    status: 'PENDING',
    createdAt: SCREENING_DATES.createdAt,
    ...overrides,
  };
}

/**
 * Exact expected processing outcomes. Values are derived from the seeded
 * algorithm: creditScore = 520 + (sha256(email) first 8 hex chars mod 331),
 * overallScore = rounded(credit points + income points + background points).
 */
export const SCREENING_CASES: ScreeningCase[] = [
  {
    key: 'approve',
    request: createScreeningRequest(),
    expected: {
      id: SCREENING_IDS.screeningId,
      propertyId: SCREENING_IDS.propertyId,
      status: 'COMPLETED',
      creditScore: 830,
      backgroundStatus: 'CLEAR',
      incomeVerified: true,
      overallScore: 86,
      recommendation: 'APPROVE',
      riskFactors: [],
      createdAt: SCREENING_DATES.createdAt,
      completedAt: SCREENING_DATES.completedAt,
    },
  },
  {
    key: 'conditional',
    request: createScreeningRequest({
      applicantName: APPLICANTS.conditional.name,
      applicantEmail: APPLICANTS.conditional.email,
      monthlyIncome: APPLICANTS.conditional.monthlyIncome,
      monthlyRent: APPLICANTS.conditional.monthlyRent,
    }),
    expected: {
      id: SCREENING_IDS.screeningId,
      propertyId: SCREENING_IDS.propertyId,
      status: 'COMPLETED',
      creditScore: 604,
      backgroundStatus: 'CLEAR',
      incomeVerified: true,
      overallScore: 63,
      recommendation: 'CONDITIONAL',
      riskFactors: [],
      createdAt: SCREENING_DATES.createdAt,
      completedAt: SCREENING_DATES.completedAt,
    },
  },
  {
    key: 'deny',
    request: createScreeningRequest({
      applicantName: APPLICANTS.deny.name,
      applicantEmail: APPLICANTS.deny.email,
      monthlyIncome: APPLICANTS.deny.monthlyIncome,
      monthlyRent: APPLICANTS.deny.monthlyRent,
    }),
    expected: {
      id: SCREENING_IDS.denyScreeningId,
      propertyId: SCREENING_IDS.propertyId,
      status: 'COMPLETED',
      creditScore: 520,
      backgroundStatus: 'CLEAR',
      incomeVerified: false,
      overallScore: 46,
      recommendation: 'DENY',
      riskFactors: [
        { ...RISK_FACTORS.creditScore },
        { ...RISK_FACTORS.incomeVerification },
        { ...RISK_FACTORS.rentToIncome },
      ],
      createdAt: SCREENING_DATES.createdAt,
      completedAt: SCREENING_DATES.completedAt,
    },
  },
  {
    key: 'optOut',
    request: createScreeningRequest({
      applicantName: APPLICANTS.optOut.name,
      applicantEmail: APPLICANTS.optOut.email,
      monthlyIncome: APPLICANTS.optOut.monthlyIncome,
      monthlyRent: APPLICANTS.optOut.monthlyRent,
      optOut: true,
    }),
    expected: {
      id: SCREENING_IDS.screeningId,
      propertyId: SCREENING_IDS.propertyId,
      status: 'COMPLETED',
      creditScore: 601,
      backgroundStatus: 'CLEAR',
      incomeVerified: true,
      overallScore: 71,
      recommendation: 'CONDITIONAL',
      riskFactors: [],
      createdAt: SCREENING_DATES.createdAt,
      completedAt: SCREENING_DATES.completedAt,
    },
  },
  {
    key: 'backgroundReview',
    request: createScreeningRequest({
      applicantName: APPLICANTS.backgroundReview.name,
      applicantEmail: APPLICANTS.backgroundReview.email,
      monthlyIncome: APPLICANTS.backgroundReview.monthlyIncome,
      monthlyRent: APPLICANTS.backgroundReview.monthlyRent,
    }),
    expected: {
      id: SCREENING_IDS.screeningId,
      propertyId: SCREENING_IDS.propertyId,
      status: 'COMPLETED',
      creditScore: 730,
      backgroundStatus: 'CONSIDER',
      incomeVerified: true,
      overallScore: 68,
      recommendation: 'CONDITIONAL',
      riskFactors: [{ ...RISK_FACTORS.backgroundCheck }],
      createdAt: SCREENING_DATES.createdAt,
      completedAt: SCREENING_DATES.completedAt,
    },
  },
];

export function screeningCase(
  key: ScreeningCase['key'],
): ScreeningCase {
  const found = SCREENING_CASES.find((candidate) => candidate.key === key);
  if (!found) throw new Error(`Unknown screening case: ${key}`);
  return {
    key: found.key,
    request: { ...found.request },
    expected: {
      ...found.expected,
      riskFactors: found.expected.riskFactors?.map((factor) => ({ ...factor })),
    },
  };
}

/** Payloads that the POST DTO / service must reject with HTTP 400. */
export function invalidApplicantPayloads(): InvalidApplicantCase[] {
  const base = createScreeningRequest() as unknown as Record<string, unknown>;
  return [
    { name: 'missing consent', payload: { ...base, consent: undefined }, reason: 'consent is required' },
    { name: 'consent not given', payload: { ...base, consent: false }, reason: 'consent must be true' },
    { name: 'invalid email', payload: { ...base, applicantEmail: 'not-an-email' }, reason: 'email must be valid' },
    { name: 'invalid property id', payload: { ...base, propertyId: 'property-1' }, reason: 'propertyId must be a UUID' },
    { name: 'empty applicant name', payload: { ...base, applicantName: '  ' }, reason: 'name is required' },
    { name: 'negative income', payload: { ...base, monthlyIncome: -1 }, reason: 'income must be >= 0' },
    { name: 'non-numeric rent', payload: { ...base, monthlyRent: 'not-a-number' }, reason: 'rent must be numeric' },
  ];
}

/** Expected privacy behaviour after processing an opt-out screening. */
export function privacyOptOutExpectation() {
  const scenario = screeningCase('optOut');
  return {
    request: scenario.request,
    processed: scenario.expected,
    ...PRIVACY_OPT_OUT,
  };
}

/** Ordered HTTP steps for the complete request -> process -> retrieve flow. */
export function screeningFlowSteps() {
  const scenario = screeningCase('approve');
  return [
    {
      name: 'request screening',
      method: 'POST' as const,
      path: '/tenant-screenings',
      body: scenario.request as unknown as Record<string, unknown>,
      expectedStatus: 201,
      expectedStatusValue: 'PENDING' as ScreeningStatus,
    },
    {
      name: 'retrieve pending screening',
      method: 'GET' as const,
      path: `/tenant-screenings/${SCREENING_IDS.screeningId}`,
      expectedStatus: 200,
      expectedStatusValue: 'PENDING' as ScreeningStatus,
    },
    {
      name: 'run checks and compute score',
      method: 'POST' as const,
      path: `/tenant-screenings/${SCREENING_IDS.screeningId}/process`,
      expectedStatus: 201,
      expectedStatusValue: 'COMPLETED' as ScreeningStatus,
    },
    {
      name: 'retrieve completed result',
      method: 'GET' as const,
      path: `/tenant-screenings/${SCREENING_IDS.screeningId}`,
      expectedStatus: 200,
      expectedStatusValue: 'COMPLETED' as ScreeningStatus,
    },
  ];
}

export function tenantScreeningScenario() {
  return {
    createRequest: createScreeningRequest(),
    pending: pendingScreening(),
    cases: SCREENING_CASES.map((entry) => screeningCase(entry.key)),
    invalidApplicants: invalidApplicantPayloads(),
    privacyOptOut: privacyOptOutExpectation(),
    flow: screeningFlowSteps(),
  };
}
