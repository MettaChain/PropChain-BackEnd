# Inspection Scheduling — test plan (issue #1571)

**Scope note.** Per project instruction, executable tests (`*.spec.ts` / `*.test.ts`) are
intentionally out of scope for this change. This plan plus
[`fixtures/inspection-scheduling.fixtures.ts`](./fixtures/inspection-scheduling.fixtures.ts)
are non-test support artifacts only; they add no Jest suites and are not picked up by
`npm test`. Acceptance criterion “Tests pass with npm test” is therefore a verification
step for the future test files, not a claim made by this document.

**Contract note.** The route/payload shapes below are derived from the issue text. No
inspection module exists under `api-extensions/modules/` at this revision, so future
tests must adapt paths and delegate names to the implementation that lands.

## Reference patterns (read-only)

- `test/e2e/favorites.e2e.spec.ts` — `Test.createTestingModule`, fake Prisma provider,
  `ValidationPipe`, supertest.
- `test/e2e/transaction-lifecycle.e2e.spec.ts` — mocked `NotificationsService`,
  `MockAuthGuard`, global validation pipe.
- Note: the issue text mentions `src/test/e2e/`; the actual repository layout is
  `test/e2e/`.

## Fixture inventory

| Export | Use |
|---|---|
| `createBookingRequest`, `rescheduleRequest` | Valid POST/PATCH bodies; override individual fields for edge cases. |
| `bookingRecord`, `inspectionSlot`, `availableSlotsResponse` | Mock Prisma return values and expected response bodies. |
| `bookingNotificationCall`, `createNotificationsMock` | Assert booking notification arguments without a live mailer. |
| `invalidBookingPayloads`, `invalidReschedulePayloads` | Table-driven 400 validation cases. |
| `CONFLICT_ERROR`, `slotKey`, `createInspectionPrismaMock` | 409 conflict setup and in-memory slot occupancy. |
| `bookingScenario` | Bundles all of the above for one test. |

## Acceptance criteria → test approach

| # | Acceptance criterion | Intended test (future `*.e2e.spec.ts`) | Fixture(s) | Key assertions |
|---|---|---|---|---|
| 1 | `POST /inspections` creates booking | Seed slots, POST valid request, expect 201 | `createBookingRequest`, `availableSlotsResponse`, `bookingRecord` | `body.id` defined; `propertyId`, `date`, `time` echoed; `status === 'CONFIRMED'`; mock Prisma `create` called once. |
| 2 | `GET /inspections/slots` returns available slots | GET with `propertyId` and `date`, expect 200 | `availableSlotsResponse` | Array of 3 slots; `AVAILABLE` entries returned; `BLOCKED` slot status preserved; response filtered by property/date. |
| 3 | Conflict detection returns 409 | POST twice for the same property/date/time with a different inspector | `createBookingRequest`, `slotKey`, `createInspectionPrismaMock`, `CONFLICT_ERROR` | Second call `.expect(409)` with error message; only one booking stored; occupancy set unchanged after rejection. |
| 4 | `PATCH /inspections/:id` reschedules booking | Create booking, PATCH with new time, then GET or inspect mock | `rescheduleRequest`, `bookingRecord`, `createInspectionPrismaMock` | 200; `time === '11:30'`; `status === 'RESCHEDULED'`; old slot key released and new key occupied. |
| 5 | Notification triggered on booking | POST booking, inspect `NotificationsMock.calls` | `createNotificationsMock`, `bookingNotificationCall` | Exactly one call; `userId`, `type: 'INSPECTION_BOOKED'`, and metadata (`bookingId`, `propertyId`, `date`, `time`) match; no call on failed booking. |
| 6 | 400 for invalid date/time | Table-driven loop over invalid payloads on POST and PATCH | `invalidBookingPayloads`, `invalidReschedulePayloads` | Every case `.expect(400)`; Prisma `create`/`update` and notifications never called. |
| 7 | `@nestjs/testing` TestingModule with mocked providers | Build module with controller + service + mocked `PrismaService`/`NotificationsService`; `app.useGlobalPipes(new ValidationPipe({ whitelist: true }))`; `app.init()`; `app.close()` in teardown | `createInspectionPrismaMock`, `createNotificationsMock` | Module compiles; no real DB/network call; see snippet below. |
| 8 | Tests pass with `npm test` | Run `npm test -- <future inspection spec path>` once executable tests exist | all | Jest green; fixtures alone do not add suites, so this AC remains pending until tests are authored. |

## Mock setup guidance

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../../../src/database/prisma.service';
import { NotificationsService } from '../../../src/notifications/notifications.service';
// import { InspectionsController } from '../modules/inspection-scheduling/...'; // when available
import {
  createInspectionPrismaMock,
  createNotificationsMock,
} from './fixtures/inspection-scheduling.fixtures';

const prisma = createInspectionPrismaMock();
const notifications = createNotificationsMock();

const moduleRef = await Test.createTestingModule({
  controllers: [/* InspectionsController */],
  providers: [
    /* InspectionsService */,
    { provide: PrismaService, useValue: prisma },
    { provide: NotificationsService, useValue: notifications },
  ],
}).compile();

const app: INestApplication = moduleRef.createNestApplication();
app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
await app.init();
// afterAll: await app.close();
```

The mock Prisma provider keeps `bookings: Map` and `occupiedSlots: Set` and throws a
`P2002`-style error on a duplicate `slotKey`, which exercises the 409 path without a
database. If the real service catches Prisma errors instead of throwing HTTP
exceptions, assert the service's mapped exception rather than the raw mock error.

## Illustrative test skeletons (not executable files)

```ts
it('books a slot and notifies the inspector', async () => {
  const f = bookingScenario();
  await request(app.getHttpServer()).post('/inspections').send(f.request).expect(201);
  expect(notifications.calls).toEqual([f.notification]);
});

it('rejects a double booking with 409', async () => {
  const f = bookingScenario();
  await request(app.getHttpServer()).post('/inspections').send(f.request).expect(201);
  const res = await request(app.getHttpServer())
    .post('/inspections')
    .send(f.conflictRequest)
    .expect(409);
  expect(res.body.message).toBe(CONFLICT_ERROR.body.message);
});

it.each(invalidBookingPayloads())('rejects $name', async ({ payload }) => {
  await request(app.getHttpServer()).post('/inspections').send(payload).expect(400);
  expect(notifications.calls).toHaveLength(0);
});
```

## Caveats

- Provider tokens, delegate names, status codes for reschedule (200 vs 201), and
  notification title/message wording are provisional. Adjust fixtures' expectation
  helpers when the implementation lands; request and slot data stay reusable.
- Dates are fixed (`2026-06-15`) to keep conflict and reschedule assertions stable;
  do not replace them with `new Date()` in tests.
