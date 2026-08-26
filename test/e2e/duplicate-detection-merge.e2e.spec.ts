import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DuplicateDetectionController } from '../../src/duplicate-detection/duplicate-detection.controller';
import { DuplicateDetectionService } from '../../src/duplicate-detection/duplicate-detection.service';
import { FraudService } from '../../src/fraud/fraud.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { AuthUserPayload } from '../../src/auth/types/auth-user.type';
import { PrismaService } from '../../src/database/prisma.service';

const OWNER_ID = '11111111-1111-4111-a111-111111111111';
const DUPLICATE_OWNER_ID = '22222222-2222-4222-a222-222222222222';
const SURVIVING_PROPERTY_ID = '33333333-3333-4333-a333-333333333333';
const DUPLICATE_PROPERTY_ID = '44444444-4444-4444-a444-444444444444';

@Injectable()
class MockJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requestContext = context.switchToHttp().getRequest();
    if (!requestContext.headers.authorization) return false;

    const user: AuthUserPayload = {
      sub: OWNER_ID,
      email: 'owner@example.com',
      role: 'USER' as any,
      type: 'access',
    };
    requestContext.user = user;
    requestContext.authUser = user;
    return true;
  }
}

class FakePrismaService {
  properties = new Map<string, any>();
  propertyDuplicates: any[] = [];

  user = {
    findUnique: async ({ where }: any) =>
      where?.id === OWNER_ID
        ? { id: OWNER_ID, firstName: 'Owner', lastName: 'One' }
        : where?.id === DUPLICATE_OWNER_ID
          ? { id: DUPLICATE_OWNER_ID, firstName: 'Owner', lastName: 'Two' }
          : null,
  } as any;

  property = {
    findMany: async ({ where }: any) =>
      Array.from(this.properties.values()).filter(
        (property) =>
          property.ownerId !== where.ownerId.not &&
          property.address.toLowerCase() === where.address.equals.toLowerCase() &&
          property.city.toLowerCase() === where.city.equals.toLowerCase() &&
          property.state.toLowerCase() === where.state.equals.toLowerCase() &&
          property.zipCode === where.zipCode &&
          property.country.toLowerCase() === where.country.equals.toLowerCase(),
      ),
    findUnique: async ({ where }: any) => this.properties.get(where.id) ?? null,
    update: async ({ where, data }: any) => {
      const property = this.properties.get(where.id);
      const updated = { ...property, ...data };
      this.properties.set(where.id, updated);
      return updated;
    },
  } as any;

  propertyImage = {
    findMany: async () => [],
    findFirst: async () => null,
    update: async ({ where, data }: any) => ({ id: where.id, ...data }),
  } as any;

  propertyDuplicate = {
    create: async ({ data }: any) => {
      const record = { id: `duplicate-${this.propertyDuplicates.length + 1}`, ...data };
      this.propertyDuplicates.push(record);
      return record;
    },
  } as any;
}

describe('Duplicate detection merge (e2e)', () => {
  let app: INestApplication;
  let fakePrisma: FakePrismaService;

  beforeAll(async () => {
    fakePrisma = new FakePrismaService();
    fakePrisma.properties.set(SURVIVING_PROPERTY_ID, {
      id: SURVIVING_PROPERTY_ID,
      ownerId: OWNER_ID,
      title: 'Original Oak Street Home',
      address: '10 Oak Street',
      city: 'Austin',
      state: 'TX',
      zipCode: '78701',
      country: 'USA',
      price: 500000,
      features: ['garage'],
      viewCount: 4,
      status: 'ACTIVE',
    });
    fakePrisma.properties.set(DUPLICATE_PROPERTY_ID, {
      id: DUPLICATE_PROPERTY_ID,
      ownerId: DUPLICATE_OWNER_ID,
      title: 'Oak Street Home Copy',
      address: '10 oak street',
      city: 'austin',
      state: 'tx',
      zipCode: '78701',
      country: 'USA',
      price: 505000,
      features: ['pool'],
      viewCount: 7,
      status: 'ACTIVE',
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [DuplicateDetectionController],
      providers: [
        DuplicateDetectionService,
        { provide: PrismaService, useValue: fakePrisma },
        { provide: FraudService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new MockJwtAuthGuard())
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('detects the seeded duplicate over HTTP with address evidence', async () => {
    const response = await request(app.getHttpServer())
      .post('/properties/duplicates/check')
      .set('Authorization', 'Bearer valid')
      .send({
        address: '10 OAK STREET',
        city: 'Austin',
        state: 'TX',
        zipCode: '78701',
        country: 'USA',
      })
      .expect(201);

    expect(response.body.hasDuplicates).toBe(true);
    expect(response.body.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: DUPLICATE_PROPERTY_ID,
          type: 'ADDRESS',
          confidenceScore: 95,
          matchedOn: ['address'],
        }),
      ]),
    );
  });

  it('merges the duplicate and records merge evidence over HTTP', async () => {
    const response = await request(app.getHttpServer())
      .patch('/properties/duplicates/merge')
      .set('Authorization', 'Bearer valid')
      .send({
        keepPropertyId: SURVIVING_PROPERTY_ID,
        discardPropertyId: DUPLICATE_PROPERTY_ID,
      })
      .expect(200);

    expect(response.body).toEqual({
      merged: true,
      survivingPropertyId: SURVIVING_PROPERTY_ID,
      mergedPropertyId: DUPLICATE_PROPERTY_ID,
    });
    expect(fakePrisma.properties.get(SURVIVING_PROPERTY_ID)).toEqual(
      expect.objectContaining({ features: ['garage', 'pool'], viewCount: 11, status: 'ACTIVE' }),
    );
    expect(fakePrisma.properties.get(DUPLICATE_PROPERTY_ID)).toEqual(
      expect.objectContaining({ status: 'ARCHIVED' }),
    );
    expect(fakePrisma.propertyDuplicates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          propertyId: DUPLICATE_PROPERTY_ID,
          duplicateOfId: SURVIVING_PROPERTY_ID,
          isMerged: true,
          mergedIntoId: SURVIVING_PROPERTY_ID,
          evidence: expect.objectContaining({
            mergedBy: OWNER_ID,
            mergeAction: 'merge_properties',
          }),
        }),
      ]),
    );
  });
});
