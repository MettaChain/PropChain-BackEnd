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
import { DisputesController } from '../../src/transactions/disputes.controller';
import { DisputesService } from '../../src/transactions/disputes.service';
import { AuthService } from '../../src/auth/auth.service';
import { AuthUserPayload } from '../../src/auth/types/auth-user.type';

@Injectable()
class MockAuthGuard implements CanActivate {
  private role: string;
  constructor(role = 'USER') {
    this.role = role;
  }
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.authUser = {
      sub: 'test-user-id',
      email: 'test@example.com',
      role: this.role,
      type: 'access',
    } as AuthUserPayload;
    return true;
  }
}

class FakePrismaService {
  disputes = new Map<string, any>();

  async $connect() {}
  async $disconnect() {}

  dispute = {
    create: async ({ data }: any) => {
      const id = data.id ?? 'disp-' + Math.random().toString(36).slice(2, 8);
      const record = {
        id,
        ...data,
        status: data.status ?? 'OPEN',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.disputes.set(id, record);
      return record;
    },
    findUnique: async ({ where }: any) => this.disputes.get(where.id) ?? null,
    findMany: async () => Array.from(this.disputes.values()),
    update: async ({ where, data }: any) => {
      const d = this.disputes.get(where.id);
      if (!d) return null;
      const updated = { ...d, ...data, updatedAt: new Date().toISOString() };
      this.disputes.set(where.id, updated);
      return updated;
    },
  } as any;
}

describe('Dispute Workflow e2e (open → review → resolve)', () => {
  let app: INestApplication;
  let fakePrisma: FakePrismaService;

  beforeAll(async () => {
    fakePrisma = new FakePrismaService();

    const moduleRef = await Test.createTestingModule({
      controllers: [DisputesController],
      providers: [
        DisputesService,
        new MockAuthGuard('USER'),
        { provide: PrismaService, useValue: fakePrisma as any },
        {
          provide: AuthService,
          useValue: {
            validateAccessToken: async () => ({
              sub: 'test-user-id',
              email: 'test@example.com',
              role: 'ADMIN' as any,
              type: 'access',
            }),
          } as any,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  }, 20000);

  afterAll(async () => {
    await app.close();
  });

  it('full dispute workflow: open → review → resolve', async () => {
    // Step 1: Open a dispute
    const openRes = await request(app.getHttpServer())
      .post('/disputes')
      .set('Authorization', 'Bearer test')
      .send({
        transactionId: 'txn-001',
        reason: 'PROPERTY_DAMAGE',
        description: 'Significant undisclosed damage found during inspection',
      })
      .expect(201);

    const disputeId = openRes.body.id;
    expect(disputeId).toBeDefined();
    expect(openRes.body.status).toBe('OPEN');

    // Step 2: Admin reviews the dispute
    const reviewRes = await request(app.getHttpServer())
      .patch(`/disputes/${disputeId}/review`)
      .set('Authorization', 'Bearer test')
      .send({
        status: 'UNDER_REVIEW',
        reviewerNotes: 'Investigating property condition reports',
      })
      .expect(200);

    expect(reviewRes.body.status).toBe('UNDER_REVIEW');

    // Step 3: Resolve the dispute
    const resolveRes = await request(app.getHttpServer())
      .patch(`/disputes/${disputeId}/resolve`)
      .set('Authorization', 'Bearer test')
      .send({
        status: 'RESOLVED',
        resolution: 'FULL_REFUND',
        resolutionNotes: 'Seller agreed to full refund after inspection report',
      })
      .expect(200);

    expect(resolveRes.body.status).toBe('RESOLVED');
    expect(resolveRes.body.resolution).toBe('FULL_REFUND');
  });
});
