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
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { AuthUserPayload } from '../../src/auth/types/auth-user.type';

@Injectable()
class MockAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.authUser = {
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

  document = {
    create: async ({ data }: any) => {
      const id = data.id ?? 'doc-' + Math.random().toString(36).slice(2, 8);
      const record = {
        id,
        ...data,
        status: data.status ?? 'ACTIVE',
        signatureStatus: data.signatureStatus ?? 'UNSIGNED',
        tags: data.tags ?? [],
        sharedWith: data.sharedWith ?? [],
        isPublic: false,
        isExpired: false,
        expiryNotified: false,
        auditTrail: [],
        userId: data.userId ?? 'test-user-id',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.documents.set(id, record);
      return record;
    },
    findUnique: async ({ where }: any) => this.documents.get(where.id) ?? null,
    findMany: async () => Array.from(this.documents.values()),
    update: async ({ where, data }: any) => {
      const doc = this.documents.get(where.id);
      if (!doc) return null;
      const updated = { ...doc, ...data, updatedAt: new Date().toISOString() };
      if (data.signedAt) {
        updated.signatureStatus = 'SIGNED';
      }
      this.documents.set(where.id, updated);
      return updated;
    },
  } as any;
}

describe('Document Upload → Sign → Verify Signature e2e', () => {
  let app: INestApplication;
  let fakePrisma: FakePrismaService;

  beforeAll(async () => {
    fakePrisma = new FakePrismaService();

    const moduleRef = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: fakePrisma as any },
        {
          provide: SignedUrlService,
          useValue: {
            isConfigured: () => false,
            getSignedUrl: async () => ({ url: '', objectKey: '', expiresAt: new Date() }),
          } as any,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new MockAuthGuard())
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  }, 20000);

  afterAll(async () => {
    await app.close();
  });

  it('full flow: upload → sign → verify signature', async () => {
    // Step 1: Upload a document
    const uploadRes = await request(app.getHttpServer())
      .post('/documents')
      .set('Authorization', 'Bearer test')
      .send({
        documentType: 'CONTRACT',
        fileName: 'purchase-agreement.pdf',
        fileUrl: 'https://storage.example.com/purchase-agreement.pdf',
        fileSize: 204800,
        mimeType: 'application/pdf',
      })
      .expect(201);

    const docId = uploadRes.body.id;
    expect(docId).toBeDefined();
    expect(uploadRes.body.documentType).toBe('CONTRACT');
    expect(uploadRes.body.signatureStatus).toBe('UNSIGNED');

    // Step 2: Sign the document
    const signRes = await request(app.getHttpServer())
      .post(`/documents/${docId}/sign`)
      .set('Authorization', 'Bearer test')
      .send({
        signedBy: 'Jane Doe',
        signatureHash: '0xabc123',
      })
      .expect(201);

    expect(signRes.body.signatureStatus).toBe('SIGNED');

    // Step 3: Verify the signature
    const verifyRes = await request(app.getHttpServer())
      .get(`/documents/${docId}/verify`)
      .set('Authorization', 'Bearer test')
      .expect(200);

    expect(verifyRes.body.verified).toBe(true);
    expect(verifyRes.body.signedBy).toBe('Jane Doe');
  });
});
