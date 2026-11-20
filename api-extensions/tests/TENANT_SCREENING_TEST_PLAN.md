# Tenant Screening — test plan (issue #1574)

**Scope note.** Per project instruction, executable tests (`*.spec.ts` / `*.test.ts`) are
intentionally out of scope for this change. This plan plus
[`fixtures/tenant-screening.fixtures.ts`](./fixtures/tenant-screening.fixtures.ts)
are non-test support artifacts only: no Jest suites are added and `npm test` will not
discover them. Acceptance criterion “Tests pass with npm test” is a verification step
for the future e2e files, not a claim made here.

**Implementation reference.** Unlike the other three modules, this one already exists
at `api-extensions/modules/tenant-screening/` with controller routes
`POST /tenant-screenings`, `GET /tenant-screenings`, `GET /tenant-screenings/:id` and
`POST /tenant-screenings/:id/process`. Its service is in-memory (no Prisma provider),
so a TestingModule needs only `TenantScreeningService` and its controller.

## Reference patterns (read-only)

- `test/e2e/fraud-auto-block.e2e.spec.ts` — multi-step risk flow with fake providers
  and supertest, matching the issue's requested pattern.
- `test/e2e/auth-controller.integration.spec.ts` — controller-level TestingModule setup.
- The issue mentions `src/test/e2e/`; the actual repository layout is `test/e2e/`.

## Fixture inventory

| Export | Use |
|---|---|
| `createScreeningRequest`, `pendingScreening` | Valid POST body and expected pending response. |
| `SCREENING_CASES`, `screeningCase` | Five applicants with exact expected scores, recommendations and risk factors. |
| `invalidApplicantPayloads` | Table-driven 400 validation cases. |
| `privacyOptOutExpectation`, `PRIVACY_OPT_OUT` | Opt-out request/result and fields that must never be exposed. |
| `screeningFlowSteps`, `tenantScreeningScenario` | Ordered full-flow steps and a bundled scenario. |
| `RISK_FACTORS`, `APPLICANTS`, `SCREENING_IDS`, `SCREENING_DATES` | Shared constants for assertions. |

## Acceptance criteria → test approach

| # | Acceptance criterion | Intended test (future `*.e2e.spec.ts`) | Fixture(s) | Key assertions |
|---|---|---|---|---|
| 1 | Screening request via POST | POST `/tenant-screenings` with valid body, expect 201 | `createScreeningRequest`, `pendingScreening` | `id` is a UUID; `propertyId` echoed; `status === 'PENDING'`; `createdAt` present; no score yet. |
| 2 | Result retrieval via GET | GET `/tenant-screenings/:id` before and after processing; also GET list with `?propertyId=` | `pendingScreening`, `screeningCase` | 200; same id; `PENDING` then `COMPLETED`; list contains the screening and filters by property. Unknown id returns 404. |
| 3 | Screening score computation | Table-drive `SCREENING_CASES` through `/process` in a fresh app per case | `SCREENING_CASES`, `screeningCase` | Exact `creditScore`, `backgroundStatus`, `incomeVerified` and `overallScore` match (830/86, 604/63, 520/46, 601/71, 730/68 respectively); score within 0–100; repeated `/process` is idempotent. |
| 4 | Recommendation generation | Assert recommendation and risk factors for each case | `SCREENING_CASES`, `RISK_FACTORS` | `APPROVE` for score 86, `CONDITIONAL` for 63/71/68, `DENY` for 46; DENY has `credit_score`, `income_verification`, `rent_to_income`; `backgroundReview` has only `background_check`; thresholds 75/55 respected. |
| 5 | Privacy opt-out handling | POST with `optOut: true`, process, then GET | `privacyOptOutExpectation`, `PRIVACY_OPT_OUT` | Processing succeeds (score 71); none of `applicantName`, `applicantEmail`, `monthlyIncome`, `monthlyRent`, `optOut` appears in any response; internal record is redacted to `REDACTED` / `redacted@example.invalid` if the service map is inspected. |
| 6 | 400 for invalid applicant data | Table-drive `invalidApplicantPayloads()` on POST | `invalidApplicantPayloads` | Every case `.expect(400)`; `GET` list stays empty; no processing triggered. Covers missing/false consent, bad email/UUID, empty name, negative income, non-numeric rent. |
| 7 | Complete screening flow end-to-end | Run `screeningFlowSteps()` in order against one TestingModule app | `screeningFlowSteps`, `screeningCase` | POST → GET(PENDING) → process(COMPLETED) → GET(COMPLETED); final response equals `screeningCase('approve').expected` ignoring timestamp-only differences. |
| 8 | Tests pass with `npm test` | Run `npm test -- <future screening spec path>` once executable tests exist | all | Jest green; no fixture module adds a suite, so this AC remains pending until tests are authored. |

## Setup guidance

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { TenantScreeningController } from '../modules/tenant-screening/tenant-screening.controller';
import { TenantScreeningService } from '../modules/tenant-screening/tenant-screening.service';

const moduleRef = await Test.createTestingModule({
  controllers: [TenantScreeningController],
  providers: [TenantScreeningService],
}).compile();

const app: INestApplication = moduleRef.createNestApplication();
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
await app.init();
// afterAll: await app.close();
```

`transform: true` matters: the DTO uses `@Type(() => Number)` for income and rent.
Because the service stores records in a private `Map`, create a fresh app per scoring
case (or use distinct applicant emails) so cases cannot leak state into one another.
No `PrismaService` or `NotificationsService` mock is required for this module.

## Illustrative test skeletons (not executable files)

```ts
it.each(SCREENING_CASES.map((c) => [c.key, c] as const))(
  'computes the %s outcome',
  async (_key, scenario) => {
    const created = await request(app.getHttpServer())
      .post('/tenant-screenings')
      .send(scenario.request)
      .expect(201);
    const processed = await request(app.getHttpServer())
      .post(`/tenant-screenings/${created.body.id}/process`)
      .expect(201);
    expect(processed.body).toMatchObject({
      status: 'COMPLETED',
      creditScore: scenario.expected.creditScore,
      overallScore: scenario.expected.overallScore,
      recommendation: scenario.expected.recommendation,
      riskFactors: scenario.expected.riskFactors,
    });
  },
);

it.each(invalidApplicantPayloads())('rejects $name', async ({ payload }) => {
  await request(app.getHttpServer()).post('/tenant-screenings').send(payload).expect(400);
});
```

## Caveats

- Expected scores are tied to the current sha256(email)-seeded algorithm. If scoring
  weights change, regenerate the values in `SCREENING_CASES`; the applicant emails make
  each case reproducible.
- The service generates ids with `randomUUID()` at runtime, so tests must use the
  returned id from POST rather than a fixed id built into the request (the fixture ids
  are for expected-response shaping and direct-service tests).
- The response DTO never includes applicant PII; the privacy test should assert
  absence of PII fields, not a specific redacted string in HTTP responses.
