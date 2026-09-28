import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import * as crypto from 'crypto';
import { PrismaService } from '../../src/database/prisma.service';
import { PropertyComparisonController } from '../../src/property-comparison/property-comparison.controller';
import { PropertyComparisonService } from '../../src/property-comparison/property-comparison.service';
import { AuthService } from '../../src/auth/auth.service';

class FakePrismaService {
  properties = new Map<string, any>();
  shares = new Map<string, any>();

  async $connect() {}
  async $disconnect() {}

  property = {
    findMany: async ({ where }: any) => {
      const ids: string[] = where?.id?.in ?? [];
      return ids.map((id) => this.properties.get(id)).filter(Boolean);
    },
  } as any;

  comparisonShare = {
    // Return a copy to mirror Prisma's snapshot semantics (callers must not
    // observe later mutations).
    findUnique: async ({ where }: any) => {
      const share = this.shares.get(where.shareToken);
      return share ? { ...share } : null;
    },
    create: async ({ data }: any) => {
      const record = {
        id: crypto.randomUUID(),
        createdAt: new Date(),
        revokedAt: null,
        viewCount: 0,
        lastViewedAt: null,
        ...data,
      };
      this.shares.set(record.shareToken, record);
      return record;
    },
    update: async ({ where, data }: any) => {
      const share = this.shares.get(where.shareToken);
      if (!share) throw new Error('Share not found');
      if (data.viewCount?.increment) share.viewCount += data.viewCount.increment;
      if (data.lastViewedAt) share.lastViewedAt = data.lastViewedAt;
      if (data.revokedAt) share.revokedAt = data.revokedAt;
      return share;
    },
  } as any;
}

describe('Property comparison share e2e (#1292)', () => {
  let app: INestApplication;
  let fakePrisma: FakePrismaService;
  let propertyIds: string[];

  const seedProperties = () => {
    propertyIds = [crypto.randomUUID(), crypto.randomUUID()];
    propertyIds.forEach((id, index) => {
      fakePrisma.properties.set(id, {
        id,
        title: `Property ${index + 1}`,
        address: `${index + 1} Main St`,
        city: 'Testville',
        state: 'TS',
        zipCode: '12345',
        country: 'US',
        price: 100000 + index * 50000,
        propertyType: 'HOUSE',
        bedrooms: 2 + index,
        bathrooms: 1 + index,
        squareFeet: 1000 + index * 200,
        lotSize: 0.2,
        yearBuilt: 2000 + index,
        status: 'ACTIVE',
        features: ['garage'],
        latitude: 40.7,
        longitude: -74.0,
      });
    });
  };

  beforeAll(async () => {
    fakePrisma = new FakePrismaService();

    const moduleRef = await Test.createTestingModule({
      controllers: [PropertyComparisonController],
      providers: [
        PropertyComparisonService,
        { provide: PrismaService, useValue: fakePrisma as any },
        {
          provide: AuthService,
          useValue: {
            validateAccessToken: async () => ({
              sub: 'share-owner',
              email: 'owner@example.com',
              role: 'USER' as any,
              type: 'access',
            }),
          } as any,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }));
    await app.init();
  }, 20000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    fakePrisma.properties.clear();
    fakePrisma.shares.clear();
    seedProperties();
  });

  const createShare = async () => {
    const res = await request(app.getHttpServer())
      .post('/property-comparison/share')
      .send({ propertyIds, userId: 'share-owner' })
      .expect(201);
    return res.body;
  };

  it('returns a sharing URL that points at the public serving endpoint', async () => {
    const body = await createShare();
    expect(body.shareToken).toBeDefined();
    expect(body.url).toBe(`/property-comparison/shares/${body.shareToken}`);
  });

  it('serves a valid share without owner PII and tracks the view', async () => {
    const { shareToken } = await createShare();

    const res = await request(app.getHttpServer())
      .get(`/property-comparison/shares/${shareToken}`)
      .expect(200);

    expect(res.body.shareToken).toBe(shareToken);
    expect(res.body.properties).toHaveLength(2);
    expect(res.body.viewCount).toBe(1);
    expect(res.body.properties[0]).not.toHaveProperty('owner');
  });

  it('returns 404 for an unknown token', async () => {
    await request(app.getHttpServer())
      .get('/property-comparison/shares/does-not-exist')
      .expect(404);
  });

  it('returns 404 for an expired share', async () => {
    const { shareToken } = await createShare();
    const share = fakePrisma.shares.get(shareToken);
    share.expiresAt = new Date(Date.now() - 1000);

    await request(app.getHttpServer()).get(`/property-comparison/shares/${shareToken}`).expect(404);
  });

  it('returns 404 for a revoked share', async () => {
    const { shareToken } = await createShare();

    await request(app.getHttpServer())
      .post(`/property-comparison/shares/${shareToken}/revoke`)
      .set('Authorization', 'Bearer test')
      .expect(201);

    await request(app.getHttpServer()).get(`/property-comparison/shares/${shareToken}`).expect(404);
  });
});
