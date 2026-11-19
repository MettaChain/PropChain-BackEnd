# Commission Split E2E Test Plan (issue #1575)

## Scope note

Executable test files (`*.spec.ts` / `*.test.ts`) are **intentionally out of scope** for this change per project instruction. This document plus the typed factory in `api-extensions/tests/fixtures/commission-split.fixtures.ts` are the non-test support deliverables. The coverage below is the plan for a future E2E spec; no spec file is created, and no test/lint/build command is run here.

## Target and setup (for the future spec)

- Intended location: `api-extensions/tests/commission-split.e2e.spec.ts` (not created).
- Pattern to follow: `test/e2e/transaction-lifecycle.e2e.spec.ts` — NestJS `Test.createTestingModule()` + `supertest` against `app.getHttpServer()`.
- wire only `CommissionSplitController` and `CommissionSplitService` from `api-extensions/modules/commission-split/`, plus `ValidationPipe({ transform: true, whitelist: true })` so `@Type()` / DTO validation run on HTTP input.
- Build a fresh app per test (the extension service stores splits in an in-memory `Map`), or derive a unique `transactionId` from `COMMISSION_SPLIT_IDS.transactions` per case.
- Capture `body.id` from the POST response; pass it to `buildScenarioPath(path, { splitId, firstParticipantId, secondParticipantId })`.
- Fixtures import the `SplitStatus` / `PayoutStatus` enums from `api-extensions/modules/commission-split/dto/commission-split.dto` and re-export them, so specs have a single import source.

## Acceptance criteria → fixtures → approach

| # | Acceptance criterion | Fixture(s) | Intended assertion |
|---|----------------------|------------|--------------------|
| 1 | Split creation via POST | `buildValidSplitPayload()`, `buildThreeWaySplitPayload()`, `buildSingleRecipientSplitPayload()` | `POST /commission-splits` → 201; generated `id`; `status: PENDING`; participants carry computed `amount` and `payoutStatus: PENDING`. Two-way, three-way and single-recipient splits all total 100%. |
| 2 | Percentages must total 100% | `INVALID_SPLIT_CASES` (`under-100`, `over-100`, `floating-point-under-100`), `sumPercentages()` | POST each case → 400 with `Commission split percentages must total 100%`. Complement with the three valid payloads above: exactly 100 must succeed. |
| 3 | Payout status tracking | `PAYOUT_STATE_FIXTURES`, `buildPayoutStateFixture()`, `expectedParticipantAmount()` | Call `POST /commission-splits/:id/participants/:userId/payout` for each participant; after the first expect `[PAID, PENDING]` and split still `PENDING`, after the last expect `[PAID, PAID]` and split `PAID`. Check 2-decimal amounts after `PATCH { adjustment: 500 }` (6300 / 4200). |
| 4 | Split retrieval via GET | `COMMISSION_SPLIT_ROUTES.byTransaction()`, `COMMISSION_SPLIT_ROUTES.byId()`, `COMMISSION_SPLIT_IDS.transactions` | `GET /commission-splits?transactionId=...` → 200 list filtered to that transaction; `GET /commission-splits/:id` → 200 full DTO shape. Unknown id → 404 with `SPLIT_NOT_FOUND_ERROR(id)`. |
| 5 | Dispute handling via PATCH | `DISPUTE_PATCH_PAYLOAD`, `buildDisputedSplitFixture()`, `DISPUTED_PAYOUT_ERROR` | `PATCH /commission-splits/:id` with `{ status: DISPUTED }` → 200, split and every participant `DISPUTED`; a later payout POST → 400 `Cannot pay a disputed commission split`. `UPDATE_STATUS_PAYLOADS.approved/paid` cover the other status transitions. |
| 6 | 400 for invalid split percentages | `INVALID_SPLIT_CASES`, `buildSplitPayloadFromPercentages()` | Parameterised POST loop: every case → 400. Cases with `rejectedBy: 'validation-pipe'` assert a class-validator message fragment (`splitPercentage must not be less than 0`, `...greater than 100`, `participants should not be empty`); `rejectedBy: 'service'` asserts the exact service message. Duplicate-participant and zero-total cases guard adjacent 400 paths. |
| 7 | Complete flow end-to-end | `buildLifecycleScenario()`, `COMMISSION_SPLIT_LIFECYCLE.steps` | Iterate steps in order: create → list → get → adjust → pay first → pay last → dispute → blocked payout. For each step call `buildScenarioPath(step.path, runtimeIds)`, send `step.body`, and assert `step.expected.statusCode`, `splitStatus`, `payoutStatuses`, `amounts` and error `message`. The adjustment step deliberately precedes payouts because the service resets payout state when it recalculates amounts. |
| 8 | Tests pass with `npm test` | — | Intended command once executable specs are permitted: `npm test -- commission-split.e2e`. Not executed as part of this change; see scope note. |

## Additional edge cases worth covering when specs are re-enabled

- `GET /commission-splits` with no `transactionId` returns all splits created in the fixture app.
- `POST .../participants/:unknownUserId/payout` → 404 with `PARTICIPANT_NOT_FOUND_ERROR(userId)`.
- `PATCH { adjustment: -20000 }` on a 10,000 split → 400 `Adjustment cannot make the commission total negative`.
- Malformed/non-UUID path ids → 400 from `ParseUUIDPipe`, before the service is reached.
- Ensure a fresh module instance per test so the in-memory `Map` cannot leak state between cases.
