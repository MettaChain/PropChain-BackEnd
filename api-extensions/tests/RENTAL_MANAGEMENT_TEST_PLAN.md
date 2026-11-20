# Rental Management — test plan (issue #1573)

**Scope note.** Per project instruction, executable tests (`*.spec.ts` / `*.test.ts`) are
intentionally out of scope for this change. This plan plus
[`fixtures/rental-management.fixtures.ts`](./fixtures/rental-management.fixtures.ts)
are non-test support artifacts only: no Jest suites are added and `npm test` will not
discover them. Acceptance criterion “Tests pass with npm test” is a verification step
for future executable tests, not a claim made here.

**Contract note.** No rental extension module exists under `api-extensions/modules/` at
this revision. Routes and response shapes below are inferred from the issue and should
be reconciled with the implementation when it lands.

## Reference patterns (read-only)

- `test/e2e/property-crud-search-favorite.e2e.spec.ts` — full-app supertest setup,
  fake Prisma providers, mocked auth guard, multi-step workflow.
- `test/e2e/transaction-lifecycle.e2e.spec.ts` — lifecycle-style e2e flow with mocked
  services.
- The issue mentions `src/test/e2e/`; the actual repository layout is `test/e2e/`.

## Fixture inventory

| Export | Use |
|---|---|
| `createLeaseRequest`, `leaseRecord`, `terminatedLease`, `terminateLeaseRequest` | Lease creation, state snapshots and termination. |
| `rentPaymentRequest`, `rentPaymentRecord`, `paidRentPayments` | Rent payment recording and income-summary source data. |
| `overdueScenario` | Unpaid June rent as of 2026-06-20 (15 days overdue) with expected alert. |
| `expirationAlertCases` | Leases ending in 30/60/90 days plus a 120-day negative control. |
| `RENTAL_INCOME_SUMMARY` | Expected summary for five paid payments and one overdue payment. |
| `datePlusDays`, `daysBetween` | Pure date helpers derived from fixed dates, never the system clock. |
| `rentalLifecycleSteps`, `rentalScenario` | Ordered full-flow steps and a bundled scenario. |

## Acceptance criteria → test approach

| # | Acceptance criterion | Intended test (future `*.e2e.spec.ts`) | Fixture(s) | Key assertions |
|---|---|---|---|---|
| 1 | Lease creation via POST | POST `/leases`, expect 201 | `createLeaseRequest`, `leaseRecord` | Response id; `propertyId`, `tenantId`, `startDate`, `endDate`, `monthlyRent` echoed; `status === 'ACTIVE'`. |
| 2 | Rent payment recording | POST `/leases/:id/payments`, then GET payments | `rentPaymentRequest`, `rentPaymentRecord` | 201; `amount === 2500`; `method === 'BANK_TRANSFER'`; `reference` persisted; `status === 'PAID'`; appears in list. |
| 3 | Overdue detection and alert | Seed `paidRentPayments()`, query alerts with `asOf=2026-06-20` | `overdueScenario` | Alert `type === 'RENT_OVERDUE'`; `daysOverdue === 15`; `amountDue === 2500`; `severity === 'HIGH'`; no alert when June payment is recorded first (negative case). |
| 4 | Expiration alert at 30/60/90 days | Table-drive `expirationAlertCases()` through the alerts endpoint or scheduler with a fixed as-of date | `expirationAlertCases`, `datePlusDays` | 30/60/90 cases each return `LEASE_EXPIRING` with matching `daysUntilExpiration` and severity `HIGH`/`MEDIUM`/`LOW`; 120-day case returns no alert. |
| 5 | Lease termination | POST `/leases/:id/terminate` | `terminateLeaseRequest`, `terminatedLease` | 201; `status === 'TERMINATED'`; `terminatedAt` set; reason/effectiveDate persisted; subsequent payment attempt rejected. |
| 6 | Rental income summary endpoint | GET `/leases/:id/income-summary` | `RENTAL_INCOME_SUMMARY`, `paidRentPayments` | `totalCollected === 12500`; `paidCount === 5`; `overdueCount === 1`; `outstandingAmount === 2500`; period and lease id correct. |
| 7 | Complete rental lifecycle end-to-end | Run `rentalLifecycleSteps()` in order in one test | `rentalLifecycleSteps`, `rentalScenario` | Each step's expected status; lease transitions `ACTIVE → TERMINATED`; alerts and summary reflect the recorded payments. |
| 8 | Tests pass with `npm test` | Run `npm test -- <future rental spec path>` once executable tests exist | all | Jest green; no fixture module adds a suite, so this AC remains pending until tests are authored. |

## Setup guidance

Mirror `property-crud-search-favorite.e2e.spec.ts`: build one `INestApplication` via
`Test.createTestingModule` with the rental controller/service, a fake `PrismaService`
with `lease` and `rentPayment` maps, and a mock auth guard that injects a fixed
landlord/tenant user. Apply `new ValidationPipe({ whitelist: true })`, seed the lease
and five paid payments from the fixtures, and close the app in `afterAll`.

Alerts can be verified either through a `GET /leases/:id/alerts?asOf=...` endpoint or by
calling the alert service directly with the fixed `asOf` date; both approaches use the
same `expectedAlert` fixtures.

## Illustrative test skeletons (not executable files)

```ts
it('flags rent that is 15 days overdue', async () => {
  const { expectedAlert, asOf } = overdueScenario();
  const res = await request(app.getHttpServer())
    .get(`/leases/${RENTAL_IDS.leaseId}/alerts?asOf=${asOf}`)
    .expect(200);
  expect(res.body).toEqual(expect.arrayContaining([expect.objectContaining(expectedAlert)]));
});

it.each(expirationAlertCases())(
  'alerts $daysUntilExpiration days before expiry',
  ({ lease, expectedAlert }) => {
    // Call the alert service with the lease and a fixed as-of date.
    expect(collectAlerts(lease)).toEqual(expectedAlert ? [expectedAlert] : []);
  },
);
```

## Caveats

- Alert endpoint paths, response envelopes (array vs `{ alerts: [] }`) and severity
  mapping are provisional; update only the assertion wrappers when the real API is known.
- `expirationAlertCases()` derives end dates from `2026-06-01` via `datePlusDays`, so
  expected dates are stable but differ from the long-lived lease used in
  `rentalLifecycleSteps()`; they are deliberately separate scenarios.
- `RENTAL_INCOME_SUMMARY` assumes the five January–May payments fixture is the only
  collected income; seed exactly those payments in the summary test.
