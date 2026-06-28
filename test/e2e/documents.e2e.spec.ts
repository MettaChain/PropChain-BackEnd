import {
  INestApplication,
  ValidationPipe,
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../../src/database/prisma.service';
import { DocumentsController } from '../../src/documents/documents.controller';
import { DocumentsService } from '../../src/documents/documents.service';
import { SignedUrlService } from '../../src/documents/signed-url/signed-url.service';
import { AuthService } from '../../src/auth/auth.service';
import { AuthUserPayload } from '../../src/auth/types/auth-user.type';

@Injectable()
class MockAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    request.authUser = {
      sub: 'test-user-id',
      email: 'test@example.com',
      role: 'USER',
      type: 'access',
    } as AuthUserPayload;
    return true;
  }
}

class FakePrismaService {
  documents = new Map<string, any>();

  async $connect() {}
  async $disconnect() {}
  async $transaction(arr: any[]) {
    return Promise.all(arr);
  }

  document = {
    create: async ({ data }: any) => {
      const id = data.id ?? Math.random().toString(36).slice(2, 10);
      const record = {
        id,
        ...data,
        tags: data.tags ?? [],
        sharedWith: data.sharedWith ?? [],
        isPublic: false,
        isExpired: false,
        expiryNotified: false,
        status: 'ACTIVE',
        auditTrail: [],
        userId: data.userId ?? 'test-user-id',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.documents.set(id, record);
      return record;
    },
    findUnique: async ({ where }: any) => this.documents.get(where.id) ?? null,
    findMany: async ({ where }: any) => {
      let items = Array.from(this.documents.values());
      if (where) {
        items = items.filter((d) => {
          for (const k of Object.keys(where)) {
            if (k === 'OR') {
              if (!where.OR.some((c: any) => Object.entries(c).every(([ck, cv]) => d[ck] === cv)))
                return false;
            } else if (k === 'status') {
              if (d.status !== where[k]) return false;
            } else if (d[k] !== where[k]) return false;
          }
          return true;
        });
      }
      return items;
    },
    update: async ({ where, data }: any) => {
      const doc = this.documents.get(where.id);
      const updated = { ...doc, ...data, updatedAt: new Date().toISOString() };
      this.documents.set(where.id, updated);
      return updated;
    },
    delete: async ({ where }: any) => {
      const doc = this.documents.get(where.id);
      this.documents.delete(where.id);
      return doc;
    },
    updateMany: async ({ where, data }: any) => {
      let c = 0;
      for (const [id, d] of this.documents) {
        if (where?.status && d.status === where.status) {
          this.documents.set(id, { ...d, ...data });
          c++;
        }
      }
      return { count: c };
    },
    deleteMany: async ({ where }: any) => {
      let c = 0;
      for (const [id, d] of this.documents) {
        if (where?.isExpired && d.isExpired) {
          this.documents.delete(id);
          c++;
        }
      }
      return { count: c };
    },
  } as any;
}

describe('Documents e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const fakePrisma = new FakePrismaService();

    const moduleRef = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [
        DocumentsService,
        MockAuthGuard,
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
        {
          provide: SignedUrlService,
          useValue: {
            isConfigured: () => false,
            getSignedUrl: async () => ({ url: '', objectKey: '', expiresAt: new Date() }),
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

  it('creates a document', async () => {
    const res = await request(app.getHttpServer())
      .post('/documents')
      .set('Authorization', 'Bearer test')
      .send({
        documentType: 'CONTRACT',
        fileName: 'contract.pdf',
        fileUrl: 'https://example.com/contract.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      })
      .expect(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.documentType).toBe('CONTRACT');
  });

  it('lists documents', async () => {
    await request(app.getHttpServer())
      .post('/documents')
      .set('Authorization', 'Bearer test')
      .send({
        documentType: 'TITLE_DEED',
        fileName: 'deed.pdf',
        fileUrl: 'https://example.com/deed.pdf',
      })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get('/documents')
      .set('Authorization', 'Bearer test')
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('finds a document by id', async () => {
    const created = await request(app.getHttpServer())
      .post('/documents')
      .set('Authorization', 'Bearer test')
      .send({
        documentType: 'APPRAISAL',
        fileName: 'appraisal.pdf',
        fileUrl: 'https://example.com/appraisal.pdf',
      })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(`/documents/${created.body.id}`)
      .set('Authorization', 'Bearer test')
      .expect(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it('updates a document', async () => {
    const created = await request(app.getHttpServer())
      .post('/documents')
      .set('Authorization', 'Bearer test')
      .send({
        documentType: 'DISCLOSURE',
        fileName: 'disc.pdf',
        fileUrl: 'https://example.com/disc.pdf',
      })
      .expect(201);
    const res = await request(app.getHttpServer())
      .put(`/documents/${created.body.id}`)
      .set('Authorization', 'Bearer test')
      .send({ description: 'Updated' })
      .expect(200);
    expect(res.body.description).toBe('Updated');
  });

  it('deletes a document', async () => {
    const created = await request(app.getHttpServer())
      .post('/documents')
      .set('Authorization', 'Bearer test')
      .send({
        documentType: 'PHOTO',
        fileName: 'photo.jpg',
        fileUrl: 'https://example.com/photo.jpg',
      })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/documents/${created.body.id}`)
      .set('Authorization', 'Bearer test')
      .expect(200);
    await request(app.getHttpServer())
      .get(`/documents/${created.body.id}`)
      .set('Authorization', 'Bearer test')
      .expect(404);
  });
});
