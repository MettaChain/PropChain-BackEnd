/**
 * Non-test fixture/data-factory support for issue #1571 (Inspection Scheduling).
 *
 * This module is a support artifact only: it contains no Jest globals and is not
 * a *.spec.ts / *.test.ts file. Future supertest + NestJS TestingModule tests
 * can import these factories to build deterministic requests, mock provider
 * responses and expected responses.
 *
 * Determinism: every id, timestamp and payload below is fixed. No Math.random(),
 * no crypto.randomUUID() and no `new Date()` with the current clock.
 * Each factory returns a fresh object so tests can safely mutate their copy.
 */

export type InspectionBookingStatus = 'CONFIRMED' | 'RESCHEDULED' | 'CANCELLED';
export type InspectionSlotStatus = 'AVAILABLE' | 'BLOCKED';

/** Body of POST /inspections. Dates use YYYY-MM-DD and times use 24h HH:mm. */
export interface CreateInspectionBookingRequest {
  propertyId: string;
  inspectorId: string;
  date: string;
  time: string;
  durationMinutes?: number;
  notes?: string;
}

/** Body of PATCH /inspections/:id. */
export interface RescheduleInspectionRequest {
  date: string;
  time: string;
}

export interface InspectionSlot {
  id: string;
  propertyId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: InspectionSlotStatus;
}

export interface InspectionBookingRecord {
  id: string;
  propertyId: string;
  inspectorId: string;
  date: string;
  time: string;
  durationMinutes: number;
  status: InspectionBookingStatus;
  createdAt: string;
  updatedAt: string;
}

/** Expected response of GET /inspections/slots?propertyId=...&date=... */
export interface AvailableSlotsResponse {
  propertyId: string;
  date: string;
  slots: InspectionSlot[];
}

export interface NotificationCall {
  userId: string;
  title: string;
  message: string;
  type: string;
  metadata?: Record<string, unknown>;
}

export interface InvalidPayloadCase {
  name: string;
  payload: Record<string, unknown>;
  reason: string;
}

export const INSPECTION_IDS = {
  propertyId: '33333333-3333-4333-b333-333333333333',
  inspectorId: '11111111-1111-4111-a111-111111111111',
  bookingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  conflictingBookingId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  slotId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  notificationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
} as const;

export const INSPECTION_DATES = {
  date: '2026-06-15',
  alternateDate: '2026-06-16',
  time: '09:00',
  endTime: '10:00',
  rescheduledTime: '11:30',
  createdAt: '2026-06-01T09:00:00.000Z',
  updatedAt: '2026-06-01T09:00:00.000Z',
} as const;

export function createBookingRequest(
  overrides: Partial<CreateInspectionBookingRequest> = {},
): CreateInspectionBookingRequest {
  return {
    propertyId: INSPECTION_IDS.propertyId,
    inspectorId: INSPECTION_IDS.inspectorId,
    date: INSPECTION_DATES.date,
    time: INSPECTION_DATES.time,
    durationMinutes: 60,
    notes: 'Verify roof, HVAC and electrical panel',
    ...overrides,
  };
}

export function rescheduleRequest(
  overrides: Partial<RescheduleInspectionRequest> = {},
): RescheduleInspectionRequest {
  return {
    date: INSPECTION_DATES.date,
    time: INSPECTION_DATES.rescheduledTime,
    ...overrides,
  };
}

export function bookingRecord(
  overrides: Partial<InspectionBookingRecord> = {},
): InspectionBookingRecord {
  return {
    id: INSPECTION_IDS.bookingId,
    propertyId: INSPECTION_IDS.propertyId,
    inspectorId: INSPECTION_IDS.inspectorId,
    date: INSPECTION_DATES.date,
    time: INSPECTION_DATES.time,
    durationMinutes: 60,
    status: 'CONFIRMED',
    createdAt: INSPECTION_DATES.createdAt,
    updatedAt: INSPECTION_DATES.updatedAt,
    ...overrides,
  };
}

export function inspectionSlot(overrides: Partial<InspectionSlot> = {}): InspectionSlot {
  return {
    id: INSPECTION_IDS.slotId,
    propertyId: INSPECTION_IDS.propertyId,
    date: INSPECTION_DATES.date,
    startTime: INSPECTION_DATES.time,
    endTime: INSPECTION_DATES.endTime,
    status: 'AVAILABLE',
    ...overrides,
  };
}

/** Three slots; the first is the one used by the booking and conflict cases. */
export function availableSlotsResponse(
  overrides: Partial<AvailableSlotsResponse> = {},
): AvailableSlotsResponse {
  return {
    propertyId: INSPECTION_IDS.propertyId,
    date: INSPECTION_DATES.date,
    slots: [
      inspectionSlot(),
      inspectionSlot({
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccc0002',
        startTime: '10:30',
        endTime: '11:30',
      }),
      inspectionSlot({
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccc0003',
        startTime: '13:00',
        endTime: '14:00',
        status: 'BLOCKED',
      }),
    ],
    ...overrides,
  };
}

/** Expected sendNotification(...) arguments after a successful booking. */
export function bookingNotificationCall(
  overrides: Partial<NotificationCall> = {},
): NotificationCall {
  return {
    userId: INSPECTION_IDS.inspectorId,
    title: 'Inspection scheduled',
    message: `Inspection for ${INSPECTION_IDS.propertyId} scheduled on ${INSPECTION_DATES.date} at ${INSPECTION_DATES.time}`,
    type: 'INSPECTION_BOOKED',
    metadata: {
      bookingId: INSPECTION_IDS.bookingId,
      propertyId: INSPECTION_IDS.propertyId,
      date: INSPECTION_DATES.date,
      time: INSPECTION_DATES.time,
    },
    ...overrides,
  };
}

export const CONFLICT_ERROR = {
  status: 409,
  body: {
    statusCode: 409,
    message: 'The requested inspection slot is already booked',
    error: 'Conflict',
  },
} as const;

/** Payloads that must be rejected with HTTP 400 by the DTO validation pipe. */
export function invalidBookingPayloads(): InvalidPayloadCase[] {
  const base = createBookingRequest() as unknown as Record<string, unknown>;
  return [
    {
      name: 'missing date',
      payload: { ...base, date: undefined },
      reason: 'date is required',
    },
    {
      name: 'malformed date',
      payload: { ...base, date: '15-06-2026' },
      reason: 'date must be YYYY-MM-DD',
    },
    {
      name: 'impossible calendar date',
      payload: { ...base, date: '2026-02-30' },
      reason: 'date must exist on the calendar',
    },
    {
      name: '12-hour time',
      payload: { ...base, time: '9:00 AM' },
      reason: 'time must be 24h HH:mm',
    },
    {
      name: 'out-of-range hour',
      payload: { ...base, time: '25:00' },
      reason: 'hour must be 00-23',
    },
    {
      name: 'numeric date',
      payload: { ...base, date: 20260615 },
      reason: 'date must be a string',
    },
    {
      name: 'empty inspector',
      payload: { ...base, inspectorId: '' },
      reason: 'inspectorId is required',
    },
  ];
}

export function invalidReschedulePayloads(): InvalidPayloadCase[] {
  return [
    { name: 'missing time', payload: { date: INSPECTION_DATES.date }, reason: 'time is required' },
    { name: 'bad time', payload: { time: '24:15' }, reason: 'time must be 24h HH:mm' },
    { name: 'bad date', payload: { date: '06/15/2026', time: '09:00' }, reason: 'date must be YYYY-MM-DD' },
  ];
}

/**
 * Minimal in-memory NotificationsService stub. Tests may wrap `sendNotification`
 * with jest.fn() but can also assert directly on `calls`, which avoids coupling
 * the fixtures to a test runner.
 */
export interface NotificationsMock {
  calls: NotificationCall[];
  sendNotification: (
    userId: string,
    title: string,
    message: string,
    type: string,
    metadata?: Record<string, unknown>,
  ) => Promise<{ id: string }>;
}

export function createNotificationsMock(): NotificationsMock {
  const calls: NotificationCall[] = [];
  return {
    calls,
    async sendNotification(userId, title, message, type, metadata) {
      calls.push({ userId, title, message, type, metadata });
      return { id: INSPECTION_IDS.notificationId };
    },
  };
}

/** Stable key used by the mock Prisma provider to detect slot conflicts. */
export function slotKey(propertyId: string, date: string, time: string): string {
  return `${propertyId}|${date}|${time}`;
}

/**
 * Minimal in-memory PrismaService stub for the inspection delegates.
 * Delegate names are intentionally simple; adapt the wiring in the future
 * TestingModule if the real module uses different delegate names.
 */
export interface InspectionPrismaMock {
  bookings: Map<string, InspectionBookingRecord>;
  occupiedSlots: Set<string>;
  inspectionBooking: {
    create: (args: {
      data: CreateInspectionBookingRequest & { id?: string };
    }) => Promise<InspectionBookingRecord>;
    findUnique: (args: { where: { id: string } }) => Promise<InspectionBookingRecord | null>;
    update: (
      args: { where: { id: string }; data: Partial<InspectionBookingRecord> },
    ) => Promise<InspectionBookingRecord | null>;
  };
  inspectionSlot: {
    findMany: (args: {
      where: { propertyId?: string; date?: string };
    }) => Promise<InspectionSlot[]>;
  };
}

export function createInspectionPrismaMock(
  slots: InspectionSlot[] = availableSlotsResponse().slots,
): InspectionPrismaMock {
  const bookings = new Map<string, InspectionBookingRecord>();
  const occupiedSlots = new Set<string>();

  const toRecord = (
    data: CreateInspectionBookingRequest & { id?: string },
  ): InspectionBookingRecord =>
    bookingRecord({
      id: data.id ?? INSPECTION_IDS.bookingId,
      propertyId: data.propertyId,
      inspectorId: data.inspectorId,
      date: data.date,
      time: data.time,
      durationMinutes: data.durationMinutes ?? 60,
    });

  return {
    bookings,
    occupiedSlots,
    inspectionBooking: {
      async create({ data }) {
        const key = slotKey(data.propertyId, data.date, data.time);
        if (occupiedSlots.has(key)) {
          throw Object.assign(new Error(CONFLICT_ERROR.body.message), {
            code: 'P2002',
            status: 409,
          });
        }
        const record = toRecord(data);
        bookings.set(record.id, record);
        occupiedSlots.add(key);
        return record;
      },
      async findUnique({ where }) {
        return bookings.get(where.id) ?? null;
      },
      async update({ where, data }) {
        const existing = bookings.get(where.id);
        if (!existing) return null;
        const merged = { ...existing, ...data, updatedAt: INSPECTION_DATES.updatedAt };
        occupiedSlots.delete(slotKey(existing.propertyId, existing.date, existing.time));
        occupiedSlots.add(slotKey(merged.propertyId, merged.date, merged.time));
        bookings.set(where.id, merged);
        return merged;
      },
    },
    inspectionSlot: {
      async findMany({ where }) {
        return slots.filter(
          (slot) =>
            (!where.propertyId || slot.propertyId === where.propertyId) &&
            (!where.date || slot.date === where.date),
        );
      },
    },
  };
}

/** All fixtures needed for the "booking triggers a notification" scenario. */
export function bookingScenario() {
  return {
    request: createBookingRequest(),
    slots: availableSlotsResponse(),
    created: bookingRecord(),
    notification: bookingNotificationCall(),
    conflictRequest: createBookingRequest({
      inspectorId: '22222222-2222-4222-b222-222222222222',
    }),
    conflictError: CONFLICT_ERROR,
    reschedule: rescheduleRequest(),
    rescheduled: bookingRecord({
      time: INSPECTION_DATES.rescheduledTime,
      status: 'RESCHEDULED',
    }),
  };
}
