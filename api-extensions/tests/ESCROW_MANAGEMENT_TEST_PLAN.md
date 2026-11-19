# Escrow Management — test plan (issue #1572)

**Scope note.** Per project instruction, executable tests (`*.spec.ts` / `*.test.ts`) are
intentionally out of scope for this change. This plan plus
[`fixtures/escrow-management.fixtures.ts`](./fixtures/escrow-management.fixtures.ts)
are non-test support artifacts only: no Jest suites are added and `npm test` will not
discover them. Acceptance criterion “Tests pass with npm test” is a verification step
for the future e2e files, not a claim made here.

**Contract note.** No escrow extension module exists under `api-extensions/modules/` at
this revision. The endpoints below are the intended contract inferred from the issue;
align paths, status codes and error wording with the implementation when it lands.
Status values (`PENDING | HELD | RELEASED | REFUNDED`) match the existing escrow fields
in `prisma/schema.prisma` and `UpdateEscrowDto`.

## Reference patterns (read-only)

- `test/e2e/transaction-lifecycle.e2e.spec.ts` — full-app supertest setup, in-memory
  fake Prisma, mocked `NotificationsService`, lifecycle-style assertions.
- `test/e2e/favorites.e2e.spec.ts` — `Test.createTestingModule` + fake Prisma provider.
- The issue mentions `src/test/e2e/`; the actual repository layout is `test/e2e/`.

## Fixture inventory

| Export | Use |
|---|---|
| `createEscrowRequest`, `defaultConditions`, `escrowCondition` | POST body and condition fixtures. |
| `escrowRecord`, `heldEscrow`, `releasedEscrow`, `refundedEscrow` | State snapshots for each lifecycle stage. |
| `releaseWithValidConditions`, `releaseWithMissingConditions`, `refundRequest` | Release/refund request bodies, including the failure path. |
| `DOUBLE_RELEASE_ERROR` | Expected second-release failure. |
| `escrowAuditTrail` | Ordered audit entries with fixed ids and timestamps. |
| `escrowLifecycleSteps`, `escrowRefundSteps` | Ordered HTTP step lists for full-flow tests. |
| `escrowScenario` | Bundles all fixtures for a single test file. |

## Acceptance criteria → test approach

| # | Acceptance criterion | Intended test (future `*.e2e.spec.ts`) | Fixture(s) | Key assertions |
|---|---|---|---|---|
| 1 | Escrow creation for a transaction | POST `/escrows`, expect 201 | `createEscrowRequest`, `escrowRecord` | `transactionId` echoed; amount 250000; three conditions; `status === 'PENDING'`; id returned. |
| 2 | Fund holding status | POST `/escrows/:id/hold`, then GET | `heldEscrow` | `status === 'HELD'`; amount unchanged; audit entry `FUNDS_HELD` recorded; holding a second time is rejected or idempotent per contract. |
| 3 | Conditional release with valid conditions | POST `/escrows/:id/release` with all condition ids | `releaseWithValidConditions`, `releasedEscrow` | 201; `status === 'RELEASED'`; `releasedAt` set; all conditions `met === true`; `CONDITION_MET` and `RELEASED` audit entries. Use `releaseWithMissingConditions()` for the negative path (4xx, still `HELD`). |
| 4 | Refund processing | From `HELD`, POST `/escrows/:id/refund` | `refundRequest`, `refundedEscrow`, `escrowRefundSteps` | `status === 'REFUNDED'`; `refundedAt` set; reason persisted; `REFUNDED` audit entry; no release entry. |
| 5 | Double-release prevention returns error | Release once, then release again | `DOUBLE_RELEASE_ERROR`, `releasedEscrow` | Second call is 4xx (409 expected); balance/status unchanged; no duplicate `RELEASED` audit entry. If implementation uses 422, assert that status and retain the same no-op assertions. |
| 6 | Audit trail is recorded | GET `/escrows/:id/audit` after lifecycle | `escrowAuditTrail` | Entries `CREATED → FUNDS_HELD → CONDITION_MET → RELEASED` in order; each has `escrowId`, `actorId`, `at`, `details`; no duplicate entries after rejected double release. |
| 7 | Complete escrow lifecycle end-to-end | Run `escrowLifecycleSteps()` sequentially in one test; run `escrowRefundSteps()` in a second test | `escrowLifecycleSteps`, `escrowRefundSteps` | Every step's expected HTTP status and escrow status; final audit trail matches `escrowAuditTrail`. |
| 8 | Tests pass with `npm test` | Run `npm test -- <future escrow spec path>` once executable tests exist | all | Jest green; no fixture module adds a suite, so this AC remains pending until tests are authored. |

## Setup guidance

Use the same TestingModule/supertest shape as `transaction-lifecycle.e2e.spec.ts`:
compile the escrow controller and service with a fake `PrismaService` provider holding
`escrow`, `escrowAudit` and `transaction` maps, apply
`new ValidationPipe({ whitelist: true })`, then drive the flow with
`request(app.getHttpServer())`. Seed the transaction referenced by
`ESCROW_IDS.transactionId` so creation lookups succeed. Keep a single app instance per
`describe` block and call `app.close()` in `afterAll`.

```ts
// Example: drive one step from the fixture with strict types.
const [createStep] = escrowLifecycleSteps();
if (!createStep) throw new Error('Missing lifecycle step');
await request(app.getHttpServer())
  .post(createStep.path)
  .send(createStep.body)
  .expect(createStep.expectedStatus);
```

Prefer explicit `post`/`get` calls in the real test: they keep request bodies visible,
and let each step additionally assert the escrow status and audit action from the
fixture.

## Illustrative test skeleton (not an executable file)

```ts
it('releases funds only when all conditions are met', async () => {
  const f = escrowScenario();
  await request(app.getHttpServer()).post('/escrows').send(f.createRequest).expect(201);
  await request(app.getHttpServer())
    .post(`/escrows/${ESCROW_IDS.escrowId}/hold`)
    .send({ amount: ESCROW_AMOUNT })
    .expect(201);
  await request(app.getHttpServer())
    .post(`/escrows/${ESCROW_IDS.escrowId}/release`)
    .send(f.invalidRelease)
    .expect(400);
  const released = await request(app.getHttpServer())
    .post(`/escrows/${ESCROW_IDS.escrowId}/release`)
    .send(f.release)
    .expect(201);
  expect(released.body.status).toBe('RELEASED');
  const audit = await request(app.getHttpServer())
    .get(`/escrows/${ESCROW_IDS.escrowId}/audit`)
    .expect(200);
  expect(audit.body).toEqual(f.auditTrail);
});
```

## Caveats

- Route names (`/escrows`, `/hold`, `/release`, `/refund`, `/audit`) and the 201/200
  choices are provisional; only the fixture data and expected domain transitions are
  stable.
- `DOUBLE_RELEASE_ERROR` assumes 409 because “already released” is a state conflict;
  adjust only the expected status code if the implementation chooses another 4xx.
- All amounts and timestamps are fixed, including the 250000 escrow amount, so audit
  comparisons are deterministic.
