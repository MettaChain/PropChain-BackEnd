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
import { NotificationsService } from '../../src/notifications/notifications.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { AuthUserPayload } from '../../src/auth/types/auth-user.type';

@Injectable()
class MockAuthGuard implements CanActivate {
  private role: string;
  constructor(role = 'USER') {
    this.role = role;
  }
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const payload = {
      sub: 'test-user-id',
      email: 'test@example.com',
      role: this.role,
      type: 'access',
    } as AuthUserPayload;
    req.authUser = payload;
    req.user = { id: payload.sub };
    return true;
  }
}

class FakePrismaService {
  disputes = new Map<string, any>();
  transactions = new Map<string, any>();
  users = new Map<string, any>();

  async $connect() {}
  async $disconnect() {}

  user = {
    findMany: async ({ where }: any) => {
      if (where?.role === 'ADMIN') {
        return [{ id: 'admin-1' }];
      }
      return [];
    },
  };

  transaction = {
    findUnique: async ({ where }: any) => this.transactions.get(where.id) ?? null,
  };

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

    const txId = '550e8400-e29b-41d4-a716-446655440001';
    fakePrisma.transactions.set(txId, {
      id: txId,
      buyerId: 'test-user-id',
      sellerId: 'seller-001',
      buyer: { id: 'test-user-id', email: 'test@example.com' },
      seller: { id: 'seller-001', email: 'seller@test.com' },
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [DisputesController],
      providers: [
        DisputesService,
        { provide: PrismaService, useValue: fakePrisma as any },
        {
          provide: NotificationsService,
          useValue: {
            handleTransactionUpdate: async () => {},
            sendNotification: async () => ({}),
          } as any,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new MockAuthGuard('ADMIN'))
      .compile();

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
        transactionId: '550e8400-e29b-41d4-a716-446655440001',
        reason: 'PROPERTY_DAMAGE',
        description: 'Significant undisclosed damage found during inspection',
      })
      .expect(201);

    const disputeId = openRes.body.id;
    expect(disputeId).toBeDefined();
    expect(openRes.body.status).toBe('OPEN');

    // Step 2: Admin reviews the dispute (update status)
    const reviewRes = await request(app.getHttpServer())
      .patch(`/disputes/${disputeId}/status`)
      .set('Authorization', 'Bearer test')
      .send({
        status: 'UNDER_REVIEW',
      })
      .expect(200);

    expect(reviewRes.body.status).toBe('UNDER_REVIEW');

    // Step 3: Resolve the dispute
    const resolveRes = await request(app.getHttpServer())
      .patch(`/disputes/${disputeId}/resolve`)
      .set('Authorization', 'Bearer test')
      .send({
        status: 'RESOLVED',
        details: 'Seller agreed to full refund after inspection report',
      })
      .expect(200);

    expect(resolveRes.body.status).toBe('RESOLVED');
  });
});
