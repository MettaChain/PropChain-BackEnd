import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import * as crypto from 'crypto';
import { PrismaService } from '../../src/database/prisma.service';
import { FavoritesController } from '../../src/favorites/favorites.controller';
import { FavoritesService } from '../../src/favorites/favorites.service';
import { AuthService } from '../../src/auth/auth.service';

class FakePrismaService {
  users = new Map<string, any>();
  properties = new Map<string, any>();
  propertyFavorites = new Map<string, any>();

  async $connect() {}
  async $disconnect() {}
  async $transaction(arr: any[]) {
    return Promise.all(arr);
  }

  property = {
    create: async ({ data }: any) => {
      const id = Math.random().toString(36).slice(2, 10);
      const record = {
        id,
        ...data,
        ownerId: data.owner?.connect?.id ?? data.ownerId ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (record.price?.toString) record.price = Number(record.price.toString());
      this.properties.set(id, record);
      return record;
    },
    findUnique: async ({ where }: any) => this.properties.get(where.id) ?? null,
  } as any;

  propertyFavorite = {
    create: async ({ data }: any) => {
      const existing = Array.from(this.propertyFavorites.values()).find(
        (f) => f.userId === data.userId && f.propertyId === data.propertyId,
      );
      if (existing) throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      const id = Math.random().toString(36).slice(2, 10);
      const record = { id, ...data, createdAt: new Date().toISOString() };
      this.propertyFavorites.set(id, record);
      return record;
    },
    findUnique: async ({ where }: any) => {
      if (where?.id) return this.propertyFavorites.get(where.id) ?? null;
      if (where?.userId_propertyId)
        return (
          Array.from(this.propertyFavorites.values()).find(
            (f) =>
              f.userId === where.userId_propertyId.userId &&
              f.propertyId === where.userId_propertyId.propertyId,
          ) ?? null
        );
      return null;
    },
    findMany: async ({ where, skip = 0, take = 100 }: any) => {
      const items = Array.from(this.propertyFavorites.values()).filter((f) => {
        if (!where) return true;
        for (const k of Object.keys(where)) {
          if (f[k] !== where[k]) return false;
        }
        return true;
      });
      return items.slice(skip, skip + take);
    },
    count: async ({ where }: any) => {
      return Array.from(this.propertyFavorites.values()).filter((f) => {
        if (!where) return true;
        for (const k of Object.keys(where)) {
          if (f[k] !== where[k]) return false;
        }
        return true;
      }).length;
    },
    deleteMany: async ({ where }: any) => {
      let count = 0;
      for (const [id, f] of this.propertyFavorites) {
        if (f.userId === where.userId && f.propertyId === where.propertyId) {
          this.propertyFavorites.delete(id);
          count++;
        }
      }
      return { count };
    },
  } as any;
}

describe('Favorites e2e', () => {
  let app: INestApplication;
  let fakePrisma: FakePrismaService;

  beforeAll(async () => {
    fakePrisma = new FakePrismaService();

    const moduleRef = await Test.createTestingModule({
      controllers: [FavoritesController],
      providers: [
        FavoritesService,
        { provide: PrismaService, useValue: fakePrisma as any },
        {
          provide: AuthService,
          useValue: {
            validateAccessToken: async () => ({
              sub: 'test-user-id',
              email: 'test@example.com',
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

  let propertyId: string;

  beforeEach(() => {
    const id = crypto.randomUUID();
    fakePrisma.properties.set(id, {
      id,
      title: 'Fav Property',
      address: '456 Fav St',
      city: 'FavCity',
      state: 'FS',
      zipCode: '67890',
      country: 'US',
      price: 300000,
      ownerId: 'test-user-id',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    propertyId = id;
  });

  it('adds a favorite', async () => {
    const res = await request(app.getHttpServer())
      .post(`/favorites/${propertyId}`)
      .set('Authorization', 'Bearer test')
      .expect(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.propertyId).toBe(propertyId);
  });

  it('checks favorite status', async () => {
    await request(app.getHttpServer())
      .post(`/favorites/${propertyId}`)
      .set('Authorization', 'Bearer test')
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(`/favorites/${propertyId}/status`)
      .set('Authorization', 'Bearer test')
      .expect(200);
    expect(res.body.isFavorite).toBe(true);
  });

  it('lists favorites', async () => {
    await request(app.getHttpServer())
      .post(`/favorites/${propertyId}`)
      .set('Authorization', 'Bearer test')
      .expect(201);
    const res = await request(app.getHttpServer())
      .get('/favorites')
      .set('Authorization', 'Bearer test')
      .expect(200);
    expect(res.body.items).toBeInstanceOf(Array);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it('removes a favorite', async () => {
    await request(app.getHttpServer())
      .post(`/favorites/${propertyId}`)
      .set('Authorization', 'Bearer test')
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/favorites/${propertyId}`)
      .set('Authorization', 'Bearer test')
      .expect(200);
    const res = await request(app.getHttpServer())
      .get(`/favorites/${propertyId}/status`)
      .set('Authorization', 'Bearer test')
      .expect(200);
    expect(res.body.isFavorite).toBe(false);
  });

  it('returns 404 for non-existent favorite removal', async () => {
    await request(app.getHttpServer())
      .delete(`/favorites/${crypto.randomUUID()}`)
      .set('Authorization', 'Bearer test')
      .expect(404);
  });
});
