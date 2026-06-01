import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma.service';

// Simple in-memory fake Prisma implementation sufficient for these e2e smoke tests
class FakePrismaService {
  users = new Map<string, any>();
  properties = new Map<string, any>();
  blacklistedToken = new Map<string, any>();

  async $connect() {}
  async $disconnect() {}

  async $transaction(arr: any[]) {
    // Accept array of Promises or values
    return Promise.all(arr);
  }

  user = {
    create: async ({ data }: any) => {
      const id = data.id ?? Math.random().toString(36).slice(2, 10);
      const record = { id, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      this.users.set(id, record);
      return record;
    },
    findUnique: async ({ where }: any) => {
      if (where?.id) return this.users.get(where.id) ?? null;
      if (where?.email) return Array.from(this.users.values()).find((u) => u.email === where.email) ?? null;
      if (where?.referralCode) return Array.from(this.users.values()).find((u) => u.referralCode === where.referralCode) ?? null;
      return null;
    },
    findFirst: async ({ where }: any) => {
      if (!where) return null;
      return Array.from(this.users.values()).find((u) => {
        for (const k of Object.keys(where)) {
          if (u[k] !== where[k]) return false;
        }
        return true;
      }) ?? null;
    },
    update: async ({ where, data }: any) => {
      const user = this.users.get(where.id);
      const updated = { ...user, ...data, updatedAt: new Date().toISOString() };
      this.users.set(where.id, updated);
      return updated;
    },
  } as any;

  property = {
    create: async ({ data }: any) => {
      const id = Math.random().toString(36).slice(2, 10);
      const ownerId = data.owner?.connect?.id ?? data.ownerId ?? null;
      const record = {
        id,
        ...data,
        ownerId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      // normalize Decimal-like values to numbers for testing
      if (record.price && record.price.toString) record.price = Number(record.price.toString());
      this.properties.set(id, record);
      return record;
    },
    findUnique: async ({ where, include }: any) => {
      const p = this.properties.get(where.id) ?? null;
      if (!p) return null;
      if (include?.owner) {
        const owner = this.users.get(p.ownerId) ?? null;
        return { ...p, owner };
      }
      return p;
    },
    findFirst: async ({ where }: any) => {
      return Array.from(this.properties.values()).find((prop) => {
        for (const key of Object.keys(where)) {
          if (where[key] !== prop[key]) return false;
        }
        return true;
      }) ?? null;
    },
    findMany: async ({ where, skip = 0, take = 100 }: any) => {
      const items = Array.from(this.properties.values()).filter((p) => {
        if (!where) return true;
        for (const k of Object.keys(where)) {
          const v = (where as any)[k];
          if (typeof v === 'object' && v?.equals !== undefined) {
            if (p[k] !== v.equals) return false;
          } else if (typeof v === 'object' && v?.has !== undefined) {
            if (!Array.isArray(p[k]) || !p[k].includes(v.has)) return false;
          } else if (p[k] !== v) return false;
        }
        return true;
      });
      return items.slice(skip, skip + take);
    },
    count: async ({ where }: any) => {
      const items = await this.property.findMany({ where });
      return items.length;
    },
    update: async ({ where, data }: any) => {
      const p = this.properties.get(where.id);
      const updated = { ...p, ...data, updatedAt: new Date().toISOString() };
      this.properties.set(where.id, updated);
      return updated;
    },
    delete: async ({ where }: any) => {
      const p = this.properties.get(where.id);
      this.properties.delete(where.id);
      return p;
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const [id, prop] of this.properties) {
        if (where?.id?.in && Array.isArray(where.id.in) && where.id.in.includes(id)) {
          this.properties.set(id, { ...prop, ...data, updatedAt: new Date().toISOString() });
          count++;
        }
      }
      return { count };
    },
    deleteMany: async ({ where }: any) => {
      let count = 0;
      for (const id of where.id.in || []) {
        if (this.properties.has(id)) {
          this.properties.delete(id);
          count++;
        }
      }
      return { count };
    },
  } as any;

  blacklistedToken = {
    findUnique: async ({ where }: any) => null,
    create: async (args: any) => args.data,
    findMany: async () => [],
    update: async (args: any) => args.data,
  } as any;
}

describe('Auth + Property e2e smoke', () => {
  let app: INestApplication;
  let fakePrisma: FakePrismaService;

  beforeAll(async () => {
    fakePrisma = new FakePrismaService();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma as any)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }));
    await app.init();
  }, 20000);

  afterAll(async () => {
    await app.close();
  });

  it('registers, logs in, creates a property and verifies persistence', async () => {
    const email = `smoke+${Date.now()}@example.com`;
    const password = 'ComplexPass123!';

    // Register
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, firstName: 'Smoke', lastName: 'Test' })
      .expect(201);

    expect(registerRes.body).toBeDefined();
    const userId = registerRes.body.user?.id;
    expect(userId).toBeDefined();

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    expect(loginRes.body).toBeDefined();
    const token = loginRes.body.accessToken || loginRes.body.token || loginRes.body.access_token;
    expect(token).toBeDefined();

    // Create property
    const propertyPayload = {
      title: 'E2E Test Property',
      address: '123 Test St',
      city: 'Testville',
      state: 'TS',
      zipCode: '12345',
      country: 'US',
      price: 500000,
    };

    const createRes = await request(app.getHttpServer())
      .post('/properties')
      .set('Authorization', `Bearer ${token}`)
      .send(propertyPayload)
      .expect(201);

    expect(createRes.body).toBeDefined();
    const propertyId = createRes.body.id;
    expect(propertyId).toBeDefined();

    // Verify via GET
    const getRes = await request(app.getHttpServer()).get(`/properties/${propertyId}`).expect(200);
    expect(getRes.body).toBeDefined();
    expect(getRes.body.id).toEqual(propertyId);
    expect(getRes.body.title).toEqual(propertyPayload.title);
    expect(getRes.body.ownerId || getRes.body.owner?.id).toBeDefined();
  }, 20000);
});
