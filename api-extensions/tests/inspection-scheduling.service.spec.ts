import { NotFoundException } from '@nestjs/common';
import { InspectionSchedulingService, InspectionStatus } from '../services/inspection-scheduling.service';
import { NotificationsService } from '../services/notifications.service';

describe('InspectionSchedulingService', () => {
  let service: InspectionSchedulingService;
  let notificationsService: NotificationsService;

  beforeEach(() => {
    notificationsService = new NotificationsService();
    jest.spyOn(notificationsService, 'notify').mockImplementation(() => undefined);
    service = new InspectionSchedulingService(notificationsService);
  });

  describe('available slot generation for date range', () => {
    it('generates hourly slots within the working day window', () => {
      const from = new Date('2026-12-01T00:00:00Z');
      const to = new Date('2026-12-01T23:59:00Z');

      const slots = service.generateAvailableSlots({ inspectorId: 'inspector-1', from, to });

      expect(slots.length).toBe(8);
      expect(slots[0].start.getHours()).toBe(9);
      expect(slots[slots.length - 1].end.getHours()).toBe(17);
    });

    it('generates slots across multiple days in the range', () => {
      const from = new Date('2026-12-01T00:00:00Z');
      const to = new Date('2026-12-02T23:59:00Z');

      const slots = service.generateAvailableSlots({ inspectorId: 'inspector-1', from, to });

      expect(slots.length).toBe(16);
    });

    it('excludes slots already booked from the generated availability', () => {
      const from = new Date('2026-12-03T00:00:00Z');
      const to = new Date('2026-12-03T23:59:00Z');

      const bookingStart = new Date('2026-12-03T09:00:00Z');
      const bookingEnd = new Date('2026-12-03T10:00:00Z');
      service.book({
        propertyId: 'property-1',
        inspectorId: 'inspector-1',
        start: bookingStart,
        end: bookingEnd,
        requestedBy: 'agent-1',
      });

      const slots = service.generateAvailableSlots({ inspectorId: 'inspector-1', from, to });
      expect(slots.length).toBe(7);
      expect(slots.some((slot) => slot.start.getHours() === bookingStart.getHours())).toBe(false);
    });

    it('throws when the date range is invalid', () => {
      const from = new Date('2026-12-05T00:00:00Z');
      const to = new Date('2026-12-01T00:00:00Z');

      expect(() => service.generateAvailableSlots({ inspectorId: 'inspector-1', from, to })).toThrow();
    });
  });

  describe('conflict detection when slot is already booked', () => {
    it('rejects a booking that overlaps an existing one', () => {
      service.book({
        propertyId: 'property-1',
        inspectorId: 'inspector-1',
        start: new Date('2026-12-10T09:00:00Z'),
        end: new Date('2026-12-10T10:00:00Z'),
        requestedBy: 'agent-1',
      });

      expect(() =>
        service.book({
          propertyId: 'property-2',
          inspectorId: 'inspector-1',
          start: new Date('2026-12-10T09:30:00Z'),
          end: new Date('2026-12-10T10:30:00Z'),
          requestedBy: 'agent-2',
        }),
      ).toThrow('Inspector is not available for the requested time slot');
    });

    it('allows a booking that is adjacent but not overlapping', () => {
      service.book({
        propertyId: 'property-1',
        inspectorId: 'inspector-2',
        start: new Date('2026-12-10T09:00:00Z'),
        end: new Date('2026-12-10T10:00:00Z'),
        requestedBy: 'agent-1',
      });

      const booking = service.book({
        propertyId: 'property-2',
        inspectorId: 'inspector-2',
        start: new Date('2026-12-10T10:00:00Z'),
        end: new Date('2026-12-10T11:00:00Z'),
        requestedBy: 'agent-2',
      });

      expect(booking.status).toBe(InspectionStatus.SCHEDULED);
    });
  });

  describe('booking creation and validation', () => {
    it('creates a booking and triggers a notification', () => {
      const booking = service.book({
        propertyId: 'property-1',
        inspectorId: 'inspector-1',
        start: new Date('2026-12-11T09:00:00Z'),
        end: new Date('2026-12-11T10:00:00Z'),
        requestedBy: 'agent-1',
      });

      expect(booking.id).toBeDefined();
      expect(booking.status).toBe(InspectionStatus.SCHEDULED);
      expect(notificationsService.notify).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'inspection.scheduled' }),
      );
    });

    it('rejects a booking where the end time is before the start time', () => {
      expect(() =>
        service.book({
          propertyId: 'property-1',
          inspectorId: 'inspector-1',
          start: new Date('2026-12-11T10:00:00Z'),
          end: new Date('2026-12-11T09:00:00Z'),
          requestedBy: 'agent-1',
        }),
      ).toThrow('Inspection end time must be after the start time');
    });
  });

  describe('rescheduling with notification trigger', () => {
    it('reschedules an inspection to a new, available time', () => {
      const booking = service.book({
        propertyId: 'property-1',
        inspectorId: 'inspector-1',
        start: new Date('2026-12-12T09:00:00Z'),
        end: new Date('2026-12-12T10:00:00Z'),
        requestedBy: 'agent-1',
      });

      const rescheduled = service.reschedule(
        booking.id,
        new Date('2026-12-13T09:00:00Z'),
        new Date('2026-12-13T10:00:00Z'),
      );

      expect(rescheduled.status).toBe(InspectionStatus.RESCHEDULED);
      expect(notificationsService.notify).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'inspection.rescheduled' }),
      );
    });

    it('rejects rescheduling to a slot that conflicts with another inspection', () => {
      service.book({
        propertyId: 'property-2',
        inspectorId: 'inspector-1',
        start: new Date('2026-12-14T11:00:00Z'),
        end: new Date('2026-12-14T12:00:00Z'),
        requestedBy: 'agent-2',
      });
      const booking = service.book({
        propertyId: 'property-1',
        inspectorId: 'inspector-1',
        start: new Date('2026-12-14T09:00:00Z'),
        end: new Date('2026-12-14T10:00:00Z'),
        requestedBy: 'agent-1',
      });

      expect(() =>
        service.reschedule(
          booking.id,
          new Date('2026-12-14T11:30:00Z'),
          new Date('2026-12-14T12:30:00Z'),
        ),
      ).toThrow();
    });

    it('rejects rescheduling a cancelled inspection', () => {
      const booking = service.book({
        propertyId: 'property-1',
        inspectorId: 'inspector-1',
        start: new Date('2026-12-15T09:00:00Z'),
        end: new Date('2026-12-15T10:00:00Z'),
        requestedBy: 'agent-1',
      });
      service.cancel(booking.id);

      expect(() =>
        service.reschedule(
          booking.id,
          new Date('2026-12-16T09:00:00Z'),
          new Date('2026-12-16T10:00:00Z'),
        ),
      ).toThrow('Cannot reschedule a cancelled inspection');
    });

    it('throws when rescheduling an unknown inspection', () => {
      expect(() =>
        service.reschedule('unknown', new Date('2026-12-16T09:00:00Z'), new Date('2026-12-16T10:00:00Z')),
      ).toThrow(NotFoundException);
    });
  });

  describe('cancellation and slot release', () => {
    it('cancels an inspection and triggers a notification', () => {
      const booking = service.book({
        propertyId: 'property-1',
        inspectorId: 'inspector-1',
        start: new Date('2026-12-17T09:00:00Z'),
        end: new Date('2026-12-17T10:00:00Z'),
        requestedBy: 'agent-1',
      });

      const cancelled = service.cancel(booking.id);

      expect(cancelled.status).toBe(InspectionStatus.CANCELLED);
      expect(notificationsService.notify).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'inspection.cancelled' }),
      );
    });

    it('releases the slot so a new booking can be made for the same time', () => {
      const booking = service.book({
        propertyId: 'property-1',
        inspectorId: 'inspector-1',
        start: new Date('2026-12-18T09:00:00Z'),
        end: new Date('2026-12-18T10:00:00Z'),
        requestedBy: 'agent-1',
      });
      service.cancel(booking.id);

      const newBooking = service.book({
        propertyId: 'property-2',
        inspectorId: 'inspector-1',
        start: new Date('2026-12-18T09:00:00Z'),
        end: new Date('2026-12-18T10:00:00Z'),
        requestedBy: 'agent-2',
      });

      expect(newBooking.status).toBe(InspectionStatus.SCHEDULED);
    });

    it('cancelling an already-cancelled inspection is idempotent', () => {
      const booking = service.book({
        propertyId: 'property-1',
        inspectorId: 'inspector-1',
        start: new Date('2026-12-19T09:00:00Z'),
        end: new Date('2026-12-19T10:00:00Z'),
        requestedBy: 'agent-1',
      });
      service.cancel(booking.id);
      const result = service.cancel(booking.id);

      expect(result.status).toBe(InspectionStatus.CANCELLED);
    });
  });

  describe('inspector availability logic', () => {
    it('reports an inspector as unavailable during a blocked time window', () => {
      service.blockInspectorTime(
        'inspector-3',
        new Date('2026-12-20T09:00:00Z'),
        new Date('2026-12-20T12:00:00Z'),
      );

      const available = service.isInspectorAvailable(
        'inspector-3',
        new Date('2026-12-20T10:00:00Z'),
        new Date('2026-12-20T11:00:00Z'),
      );

      expect(available).toBe(false);
    });

    it('reports an inspector as available outside blocked time windows', () => {
      service.blockInspectorTime(
        'inspector-4',
        new Date('2026-12-20T09:00:00Z'),
        new Date('2026-12-20T12:00:00Z'),
      );

      const available = service.isInspectorAvailable(
        'inspector-4',
        new Date('2026-12-20T13:00:00Z'),
        new Date('2026-12-20T14:00:00Z'),
      );

      expect(available).toBe(true);
    });

    it('excludes the inspection being rescheduled from its own conflict check', () => {
      const booking = service.book({
        propertyId: 'property-1',
        inspectorId: 'inspector-5',
        start: new Date('2026-12-21T09:00:00Z'),
        end: new Date('2026-12-21T10:00:00Z'),
        requestedBy: 'agent-1',
      });

      const available = service.isInspectorAvailable(
        'inspector-5',
        new Date('2026-12-21T09:00:00Z'),
        new Date('2026-12-21T10:00:00Z'),
        booking.id,
      );

      expect(available).toBe(true);
    });
  });

  describe('findOne', () => {
    it('returns an existing inspection by id', () => {
      const booking = service.book({
        propertyId: 'property-1',
        inspectorId: 'inspector-1',
        start: new Date('2026-12-22T09:00:00Z'),
        end: new Date('2026-12-22T10:00:00Z'),
        requestedBy: 'agent-1',
      });

      expect(service.findOne(booking.id).id).toBe(booking.id);
    });

    it('throws NotFoundException for an unknown inspection id', () => {
      expect(() => service.findOne('unknown')).toThrow(NotFoundException);
    });
  });
});
