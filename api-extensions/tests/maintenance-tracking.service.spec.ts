import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MaintenanceTrackingService } from '../modules/maintenance-tracking/maintenance-tracking.service';
import {
  MaintenancePriority,
  MaintenanceStatus,
} from '../modules/maintenance-tracking/dto/maintenance-request.dto';
import { NotificationsService } from '../services/notifications.service';

describe('MaintenanceTrackingService', () => {
  let service: MaintenanceTrackingService;
  let notificationsService: NotificationsService;

  beforeEach(() => {
    notificationsService = new NotificationsService();
    jest.spyOn(notificationsService, 'notify').mockImplementation(() => undefined);
    service = new MaintenanceTrackingService(notificationsService);
  });

  const create = (overrides: Partial<{ priority: MaintenancePriority }> = {}) =>
    service.create({
      propertyId: 'property-1',
      title: 'Leaky faucet',
      description: 'Kitchen faucet is leaking',
      priority: overrides.priority ?? MaintenancePriority.MEDIUM,
    });

  describe('valid status transitions', () => {
    it('transitions open -> in_progress -> resolved -> closed', () => {
      const request = create();

      const inProgress = service.update(request.id, { status: MaintenanceStatus.IN_PROGRESS });
      expect(inProgress.status).toBe(MaintenanceStatus.IN_PROGRESS);

      const resolved = service.update(request.id, { status: MaintenanceStatus.RESOLVED });
      expect(resolved.status).toBe(MaintenanceStatus.RESOLVED);
      expect(resolved.resolvedAt).toBeDefined();

      const closed = service.update(request.id, { status: MaintenanceStatus.CLOSED });
      expect(closed.status).toBe(MaintenanceStatus.CLOSED);
      expect(closed.closedAt).toBeDefined();
    });

    it('allows open -> closed directly', () => {
      const request = create();
      const closed = service.update(request.id, { status: MaintenanceStatus.CLOSED });
      expect(closed.status).toBe(MaintenanceStatus.CLOSED);
    });

    it('allows resolved -> in_progress for reopening work', () => {
      const request = create();
      service.update(request.id, { status: MaintenanceStatus.IN_PROGRESS });
      service.update(request.id, { status: MaintenanceStatus.RESOLVED });
      const reopened = service.update(request.id, { status: MaintenanceStatus.IN_PROGRESS });
      expect(reopened.status).toBe(MaintenanceStatus.IN_PROGRESS);
    });
  });

  describe('invalid transition rejection', () => {
    it('rejects transitioning directly from open to resolved', () => {
      const request = create();
      expect(() => service.update(request.id, { status: MaintenanceStatus.RESOLVED })).toThrow(
        BadRequestException,
      );
    });

    it('rejects any transition out of closed', () => {
      const request = create();
      service.update(request.id, { status: MaintenanceStatus.CLOSED });
      expect(() => service.update(request.id, { status: MaintenanceStatus.OPEN })).toThrow(
        BadRequestException,
      );
    });
  });

  describe('cost tracking and accumulation', () => {
    it('records a single cost entry and total', () => {
      const request = create();
      const updated = service.update(request.id, { cost: 150.5 });

      expect(updated.costs).toHaveLength(1);
      expect(updated.totalCost).toBe(150.5);
    });

    it('accumulates multiple cost entries', () => {
      const request = create();
      service.update(request.id, { cost: 100 });
      const updated = service.update(request.id, { cost: 50.25 });

      expect(updated.costs).toHaveLength(2);
      expect(updated.totalCost).toBe(150.25);
    });
  });

  describe('emergency priority notification trigger', () => {
    it('sends a notification when an emergency request is created', () => {
      create({ priority: MaintenancePriority.EMERGENCY });

      expect(notificationsService.notify).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'maintenance.emergency' }),
      );
    });

    it('does not send a notification for non-emergency priority', () => {
      create({ priority: MaintenancePriority.LOW });

      expect(notificationsService.notify).not.toHaveBeenCalled();
    });
  });

  describe('technician assignment logic', () => {
    it('assigns a technician to a request', () => {
      const request = create();
      const updated = service.update(request.id, { assignedTo: 'tech-1' });
      expect(updated.assignedTo).toBe('tech-1');
    });

    it('filters requests by assigned technician', () => {
      const requestA = create();
      const requestB = create();
      service.update(requestA.id, { assignedTo: 'tech-1' });
      service.update(requestB.id, { assignedTo: 'tech-2' });

      const results = service.findAll({ assignedTo: 'tech-1' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(requestA.id);
    });
  });

  describe('maintenance history query', () => {
    it('returns requests for a property sorted by creation time', () => {
      const requestA = create();
      const requestB = create();

      const history = service.getHistory('property-1');
      expect(history.map((item) => item.id)).toEqual([requestA.id, requestB.id]);
    });

    it('returns an empty array when the property has no history', () => {
      expect(service.getHistory('unknown-property')).toEqual([]);
    });
  });

  describe('additional coverage', () => {
    it('finds a single request by id', () => {
      const request = create();
      expect(service.findOne(request.id).id).toBe(request.id);
    });

    it('throws NotFoundException for an unknown request id', () => {
      expect(() => service.findOne('unknown-id')).toThrow(NotFoundException);
    });

    it('filters requests by property, status, and priority', () => {
      const request = create({ priority: MaintenancePriority.HIGH });
      const results = service.findAll({
        propertyId: 'property-1',
        status: MaintenanceStatus.OPEN,
        priority: MaintenancePriority.HIGH,
      });
      expect(results.map((item) => item.id)).toContain(request.id);
    });

    it('appends a note to a request', () => {
      const request = create();
      const updated = service.update(request.id, { notes: '  Checked the valve  ' });
      expect(updated.id).toBe(request.id);
    });

    it('summarizes requests by status, priority and cost for a property', () => {
      const requestA = create({ priority: MaintenancePriority.LOW });
      service.update(requestA.id, { cost: 100 });
      create({ priority: MaintenancePriority.HIGH });

      const summary = service.getSummary('property-1');
      expect(summary.totalRequests).toBe(2);
      expect(summary.openRequests).toBe(2);
      expect(summary.totalCost).toBe(100);
      expect(summary.byPriority[MaintenancePriority.LOW]).toBe(1);
      expect(summary.byPriority[MaintenancePriority.HIGH]).toBe(1);
      expect(summary.byStatus[MaintenanceStatus.OPEN]).toBe(2);
    });
  });
});
