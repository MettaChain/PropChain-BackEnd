/**
 * Integration tests: PropertiesController over HTTP.
 *
 * Real controller, Nest HTTP stack and the same global ValidationPipe settings as
 * main.ts, with mocked services and role-aware guards. Covers public reads, the
 * 404 contract, query/body validation, role enforcement and argument passing.
 */

import {
  BadRequestException,
  CanActivate,
  ConflictException,
  ExecutionContext,
  INestApplication,
  Injectable,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PropertiesController } from '../../src/properties/properties.controller';
import { PropertiesService } from '../../src/properties/properties.service';
import { PropertyReportService } from '../../src/properties/report/property-report.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/auth/guards/roles.guard';

/** "Authorization: Bearer role:ADMIN|AGENT|USER"; anything else is rejected. */
@Injectable()
class RoleTestGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer role:')) return false;
    const role = header.slice('Bearer role:'.length);
    req.authUser = { sub: `${role.toLowerCase()}-1`, email: `${role}@example.com`, role, type: 'access' };
    return true;
  }
}

/** Stands in for RolesGuard + @Roles on the routes this suite exercises. */
@Injectable()
class RoleListGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const method: string = req.method;
    const role: string | undefined = req.authUser?.role;
    // PUT: AGENT or ADMIN. DELETE and everything else admin-gated here: ADMIN.
    if (method === 'PUT') return role === 'AGENT' || role === 'ADMIN';
    return role === 'ADMIN';
  }
}

describe('PropertiesController (integration)', () => {
  let app: INestApplication;
  const propertiesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    searchProperties: jest.fn(),
    transitionStatus: jest.fn(),
    approveProperty: jest.fn(),
    rejectProperty: jest.fn(),
    bulkUpdatePropertyStatus: jest.fn(),
    bulkDeleteProperties: jest.fn(),
    bulkExportProperties: jest.fn(),
    assignAgent: jest.fn(),
    updateAgentAssignment: jest.fn(),
    removeAgentAssignment: jest.fn(),
    getAgents: jest.fn(),
    addAmenity: jest.fn(),
    getAmenities: jest.fn(),
    updateAmenity: jest.fn(),
    removeAmenity: jest.fn(),
  };
  const propertyReportService = {
    generatePropertyReport: jest.fn(),
  };

  const as = (role: string, r: request.Test) => r.set('Authorization', `Bearer role:${role}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PropertiesController],
      providers: [
        { provide: PropertiesService, useValue: propertiesService },
        { provide: PropertyReportService, useValue: propertyReportService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(RoleTestGuard)
      .overrideGuard(RolesGuard)
      .useClass(RoleListGuard)
      .compile();

    app = moduleRef.createNestApplication();
    // Same settings as src/main.ts.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('public reads', () => {
    it('GET /properties lists without authentication', async () => {
      propertiesService.findAll.mockResolvedValue([{ id: 'p1' }]);
      const res = await request(app.getHttpServer()).get('/properties').expect(200);
      expect(res.body).toEqual([{ id: 'p1' }]);
    });

    it('GET /properties/:id returns the property', async () => {
      propertiesService.findOne.mockResolvedValue({ id: 'p1', title: 'Loft' });
      const res = await request(app.getHttpServer()).get('/properties/p1').expect(200);
      expect(res.body).toMatchObject({ id: 'p1', title: 'Loft' });
      expect(propertiesService.findOne).toHaveBeenCalledWith('p1');
    });

    it('GET /properties/:id answers 404 for an unknown property', async () => {
      propertiesService.findOne.mockResolvedValue(null);
      await request(app.getHttpServer()).get('/properties/missing').expect(404);
    });
  });

  describe('GET /properties/search', () => {
    it('is matched before :id and coerces numeric filters', async () => {
      propertiesService.searchProperties.mockResolvedValue({ items: [], total: 0 });

      await request(app.getHttpServer())
        .get('/properties/search?city=Austin&minPrice=1000&bedrooms=2')
        .expect(200);

      expect(propertiesService.searchProperties).toHaveBeenCalledWith(
        expect.objectContaining({ city: 'Austin', minPrice: 1000, bedrooms: 2 }),
      );
      expect(propertiesService.findOne).not.toHaveBeenCalled();
    });

    it('rejects a negative price with 400', async () => {
      await request(app.getHttpServer()).get('/properties/search?minPrice=-5').expect(400);
      expect(propertiesService.searchProperties).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric bedrooms filter with 400', async () => {
      await request(app.getHttpServer()).get('/properties/search?bedrooms=many').expect(400);
    });
  });

  describe('POST /properties', () => {
    const valid = {
      title: 'Loft',
      address: '1 Main St',
      city: 'Austin',
      state: 'TX',
      zipCode: '73301',
      price: 250000,
      propertyType: 'APARTMENT',
    };

    it('requires authentication', async () => {
      await request(app.getHttpServer()).post('/properties').send(valid).expect(403);
    });

    it('creates a property owned by the caller', async () => {
      propertiesService.create.mockResolvedValue({ id: 'p1' });

      await as('USER', request(app.getHttpServer()).post('/properties').send(valid)).expect(201);

      expect(propertiesService.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Loft', price: 250000 }),
        'user-1',
      );
    });

    it('rejects a missing required field with 400', async () => {
      const { city: _omit, ...withoutCity } = valid;
      await as('USER', request(app.getHttpServer()).post('/properties').send(withoutCity)).expect(400);
      expect(propertiesService.create).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric price with 400', async () => {
      await as(
        'USER',
        request(app.getHttpServer()).post('/properties').send({ ...valid, price: 'cheap' }),
      ).expect(400);
    });

    it('rejects unknown fields with 400 (forbidNonWhitelisted)', async () => {
      await as(
        'USER',
        request(app.getHttpServer()).post('/properties').send({ ...valid, ownerId: 'someone-else' }),
      ).expect(400);
      expect(propertiesService.create).not.toHaveBeenCalled();
    });
  });

  describe('role-restricted writes', () => {
    it('PUT /properties/:id is rejected for a plain USER', async () => {
      await as('USER', request(app.getHttpServer()).put('/properties/p1').send({ title: 'New' })).expect(403);
      expect(propertiesService.update).not.toHaveBeenCalled();
    });

    it('PUT /properties/:id is allowed for an AGENT and passes the caller id', async () => {
      propertiesService.update.mockResolvedValue({ id: 'p1' });

      await as('AGENT', request(app.getHttpServer()).put('/properties/p1').send({ title: 'New' })).expect(200);

      expect(propertiesService.update).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ title: 'New' }),
        'agent-1',
      );
    });

    it('DELETE /properties/:id is admin-only', async () => {
      await as('AGENT', request(app.getHttpServer()).delete('/properties/p1')).expect(403);
      expect(propertiesService.remove).not.toHaveBeenCalled();

      propertiesService.remove.mockResolvedValue({ id: 'p1', deleted: true });
      await as('ADMIN', request(app.getHttpServer()).delete('/properties/p1')).expect(200);
      expect(propertiesService.remove).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ sub: 'admin-1', role: 'ADMIN' }),
      );
    });
  });

  describe('status lifecycle', () => {
    const asUser = (r: request.Test) => as('USER', r);

    it('PATCH /properties/:id/status is open to any authenticated caller and forwards the role', async () => {
      propertiesService.transitionStatus.mockResolvedValue({ id: 'p1', status: 'ACTIVE' });

      await asUser(
        request(app.getHttpServer()).patch('/properties/p1/status').send({ status: 'ACTIVE' }),
      ).expect(200);

      expect(propertiesService.transitionStatus).toHaveBeenCalledWith(
        'p1',
        'ACTIVE',
        'user-1',
        'USER',
      );
    });

    it('PATCH /properties/:id/status requires authentication', async () => {
      await request(app.getHttpServer())
        .patch('/properties/p1/status')
        .send({ status: 'ACTIVE' })
        .expect(403);
      expect(propertiesService.transitionStatus).not.toHaveBeenCalled();
    });

    it('PATCH /properties/:id/status rejects a status outside the enum with 400', async () => {
      await asUser(
        request(app.getHttpServer()).patch('/properties/p1/status').send({ status: 'NOPE' }),
      ).expect(400);
      expect(propertiesService.transitionStatus).not.toHaveBeenCalled();
    });

    it('surfaces a rejected transition as 400', async () => {
      propertiesService.transitionStatus.mockRejectedValue(
        new BadRequestException('Cannot transition property from DRAFT to SOLD'),
      );

      await asUser(
        request(app.getHttpServer()).patch('/properties/p1/status').send({ status: 'SOLD' }),
      ).expect(400);
    });

    it('PATCH approve and reject are admin-only', async () => {
      await as('AGENT', request(app.getHttpServer()).patch('/properties/p1/approve')).expect(403);
      await as('AGENT', request(app.getHttpServer()).patch('/properties/p1/reject')).expect(403);
      expect(propertiesService.approveProperty).not.toHaveBeenCalled();
      expect(propertiesService.rejectProperty).not.toHaveBeenCalled();
    });

    it('PATCH approve and reject call through for an admin', async () => {
      propertiesService.approveProperty.mockResolvedValue({ id: 'p1', status: 'ACTIVE' });
      propertiesService.rejectProperty.mockResolvedValue({ id: 'p1', status: 'ARCHIVED' });

      await as('ADMIN', request(app.getHttpServer()).patch('/properties/p1/approve')).expect(200);
      await as('ADMIN', request(app.getHttpServer()).patch('/properties/p1/reject')).expect(200);

      expect(propertiesService.approveProperty).toHaveBeenCalledWith('p1', 'admin-1');
      expect(propertiesService.rejectProperty).toHaveBeenCalledWith('p1', 'admin-1');
    });
  });

  describe('bulk operations', () => {
    const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];

    it('are admin-only', async () => {
      await as(
        'AGENT',
        request(app.getHttpServer()).post('/properties/bulk/status').send({ propertyIds: ids, status: 'ACTIVE' }),
      ).expect(403);
      expect(propertiesService.bulkUpdatePropertyStatus).not.toHaveBeenCalled();
    });

    it('POST bulk/status validates the id list and forwards it', async () => {
      propertiesService.bulkUpdatePropertyStatus.mockResolvedValue({ updatedCount: 2 });

      await as(
        'ADMIN',
        request(app.getHttpServer())
          .post('/properties/bulk/status')
          .send({ propertyIds: ids, status: 'ARCHIVED' }),
      ).expect(201);

      expect(propertiesService.bulkUpdatePropertyStatus).toHaveBeenCalledWith(ids, 'ARCHIVED');
    });

    it('POST bulk/status rejects an empty id list with 400', async () => {
      await as(
        'ADMIN',
        request(app.getHttpServer()).post('/properties/bulk/status').send({ propertyIds: [], status: 'ACTIVE' }),
      ).expect(400);
      expect(propertiesService.bulkUpdatePropertyStatus).not.toHaveBeenCalled();
    });

    it('POST bulk/status rejects a malformed id with 400', async () => {
      await as(
        'ADMIN',
        request(app.getHttpServer())
          .post('/properties/bulk/status')
          .send({ propertyIds: ['not-a-uuid'], status: 'ACTIVE' }),
      ).expect(400);
    });

    it('POST bulk/delete reports the ids that were actually removed', async () => {
      propertiesService.bulkDeleteProperties.mockResolvedValue({
        deletedCount: 1,
        propertyIds: [ids[0]],
      });

      const res = await as(
        'ADMIN',
        request(app.getHttpServer()).post('/properties/bulk/delete').send({ propertyIds: ids }),
      ).expect(201);

      expect(res.body).toEqual({ deletedCount: 1, propertyIds: [ids[0]] });
      expect(propertiesService.bulkDeleteProperties).toHaveBeenCalledWith(ids);
    });

    it('POST bulk/delete surfaces a foreign-key conflict as 409', async () => {
      propertiesService.bulkDeleteProperties.mockRejectedValue(
        new ConflictException('One or more properties are referenced by transactions or documents'),
      );

      await as(
        'ADMIN',
        request(app.getHttpServer()).post('/properties/bulk/delete').send({ propertyIds: ids }),
      ).expect(409);
    });

    it('POST bulk/export forwards the optional title filter', async () => {
      propertiesService.bulkExportProperties.mockResolvedValue({ total: 0, data: [] });

      await as(
        'ADMIN',
        request(app.getHttpServer())
          .post('/properties/bulk/export')
          .send({ propertyIds: ids, filter: 'loft' }),
      ).expect(201);

      expect(propertiesService.bulkExportProperties).toHaveBeenCalledWith(ids, 'loft');
    });
  });

  describe('agent assignment', () => {
    it('POST /properties/:id/agents requires authentication', async () => {
      await request(app.getHttpServer())
        .post('/properties/p1/agents')
        .send({ agentId: 'agent-1' })
        .expect(403);
    });

    it('assigns an agent and forwards the caller', async () => {
      propertiesService.assignAgent.mockResolvedValue({ id: 'pa1' });

      await as(
        'USER',
        request(app.getHttpServer()).post('/properties/p1/agents').send({ agentId: 'agent-1' }),
      ).expect(201);

      expect(propertiesService.assignAgent).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ agentId: 'agent-1' }),
        expect.objectContaining({ sub: 'user-1' }),
      );
    });

    it('PUT /properties/:id/agents/:agentId passes the agent id through', async () => {
      propertiesService.updateAgentAssignment.mockResolvedValue({ id: 'pa1' });

      await as(
        'USER',
        request(app.getHttpServer())
          .put('/properties/p1/agents/agent-1')
          .send({ commissionRate: 0.05 }),
      ).expect(200);

      expect(propertiesService.updateAgentAssignment).toHaveBeenCalledWith(
        'p1',
        'agent-1',
        expect.objectContaining({ commissionRate: 0.05 }),
        expect.objectContaining({ sub: 'user-1' }),
      );
    });

    it('DELETE /properties/:id/agents/:agentId passes the agent id through', async () => {
      propertiesService.removeAgentAssignment.mockResolvedValue({ id: 'pa1' });

      await as(
        'USER',
        request(app.getHttpServer()).delete('/properties/p1/agents/agent-1'),
      ).expect(200);

      expect(propertiesService.removeAgentAssignment).toHaveBeenCalledWith(
        'p1',
        'agent-1',
        expect.objectContaining({ sub: 'user-1' }),
      );
    });

    it('surfaces a missing assignment as 404', async () => {
      propertiesService.removeAgentAssignment.mockRejectedValue(
        new NotFoundException('Agent assignment not found for this property'),
      );

      await as(
        'USER',
        request(app.getHttpServer()).delete('/properties/p1/agents/agent-1'),
      ).expect(404);
    });

    it('GET /properties/:id/agents is readable without authentication', async () => {
      propertiesService.getAgents.mockResolvedValue([{ id: 'pa1', agentId: 'agent-1' }]);

      const res = await request(app.getHttpServer()).get('/properties/p1/agents').expect(200);

      expect(res.body).toHaveLength(1);
      expect(propertiesService.getAgents).toHaveBeenCalledWith('p1');
    });
  });

  describe('amenities', () => {
    it('POST /properties/:id/amenities validates the body', async () => {
      await as('USER', request(app.getHttpServer()).post('/properties/p1/amenities').send({})).expect(400);
      expect(propertiesService.addAmenity).not.toHaveBeenCalled();
    });

    it('adds an amenity', async () => {
      propertiesService.addAmenity.mockResolvedValue({ id: 'am1' });

      await as(
        'USER',
        request(app.getHttpServer())
          .post('/properties/p1/amenities')
          .send({ name: 'Pool', amenityType: 'OUTDOOR' }),
      ).expect(201);

      expect(propertiesService.addAmenity).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ name: 'Pool', amenityType: 'OUTDOOR' }),
      );
    });

    it('GET /properties/:id/amenities is readable without authentication', async () => {
      propertiesService.getAmenities.mockResolvedValue([{ id: 'am1' }]);

      const res = await request(app.getHttpServer()).get('/properties/p1/amenities').expect(200);

      expect(res.body).toHaveLength(1);
    });

    it('PATCH and DELETE amenities pass both ids through', async () => {
      propertiesService.updateAmenity.mockResolvedValue({ id: 'am1' });
      propertiesService.removeAmenity.mockResolvedValue({ id: 'am1' });

      await as(
        'USER',
        request(app.getHttpServer()).patch('/properties/p1/amenities/am1').send({ isAvailable: false }),
      ).expect(200);
      await as('USER', request(app.getHttpServer()).delete('/properties/p1/amenities/am1')).expect(200);

      expect(propertiesService.updateAmenity).toHaveBeenCalledWith(
        'p1',
        'am1',
        expect.objectContaining({ isAvailable: false }),
      );
      expect(propertiesService.removeAmenity).toHaveBeenCalledWith('p1', 'am1');
    });
  });

  describe('report download', () => {
    it('streams a PDF and sets the attachment headers', async () => {
      propertyReportService.generatePropertyReport.mockResolvedValue(Buffer.from('%PDF-1.4 test'));

      const res = await as('USER', request(app.getHttpServer()).get('/properties/p1/report')).expect(200);

      expect(res.headers['content-type']).toMatch(/application\/pdf/);
      expect(res.headers['content-disposition']).toContain('property-report-p1.pdf');
    });

    it('answers 404 when the listing does not exist', async () => {
      propertyReportService.generatePropertyReport.mockRejectedValue(new NotFoundException('nope'));

      await as('USER', request(app.getHttpServer()).get('/properties/missing/report')).expect(404);
    });

    it('does not leak internals when the report cannot be built', async () => {
      propertyReportService.generatePropertyReport.mockRejectedValue(new Error('pdfkit exploded'));

      const res = await as('USER', request(app.getHttpServer()).get('/properties/p1/report')).expect(500);

      expect(JSON.stringify(res.body)).not.toContain('pdfkit');
    });
  });
});
