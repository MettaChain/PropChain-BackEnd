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
import { TransactionsController } from '../../src/transactions/transactions.controller';
import { TransactionsService } from '../../src/transactions/transactions.service';
import { BlockchainService } from '../../src/blockchain/blockchain.service';
import { AuthService } from '../../src/auth/auth.service';
import { AuthUserPayload } from '../../src/auth/types/auth-user.type';

@Injectable()
class MockAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.authUser = {
      sub: 'test-user-id',
      email: 'test@example.com',
      role: 'ADMIN',
      type: 'access',
    } as AuthUserPayload;
    return true;
  }
}

class FakePrismaService {
  transactions = new Map<string, any>();

  async $connect() {}
  async $disconnect() {}

  transaction = {
    create: async ({ data }: any) => {
      const id = data.id ?? 'txn-' + Math.random().toString(36).slice(2, 8);
      const record = {
        id,
        ...data,
        status: data.status ?? 'PENDING',
        blockchainTxHash: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.transactions.set(id, record);
      return record;
    },
    findUnique: async ({ where }: any) => this.transactions.get(where.id) ?? null,
    findMany: async () => Array.from(this.transactions.values()),
    update: async ({ where, data }: any) => {
      const txn = this.transactions.get(where.id);
      if (!txn) return null;
      const updated = { ...txn, ...data, updatedAt: new Date().toISOString() };
      this.transactions.set(where.id, updated);
      return updated;
    },
  } as any;
}

describe('Transaction Lifecycle e2e', () => {
  let app: INestApplication;
  let fakePrisma: FakePrismaService;

  beforeAll(async () => {
    fakePrisma = new FakePrismaService();

    const moduleRef = await Test.createTestingModule({
      controllers: [TransactionsController],
      providers: [
        TransactionsService,
        MockAuthGuard,
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
        {
          provide: BlockchainService,
          useValue: {
            recordTransaction: async () => ({
              txHash: '0xabc123def456',
              blockNumber: 12345,
            }),
            verifyRecord: async () => ({
              verified: true,
              blockNumber: 12345,
              timestamp: new Date().toISOString(),
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

  it('full lifecycle: create → record on blockchain → verify', async () => {
    // Step 1: Create a transaction
    const createRes = await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', 'Bearer test')
      .send({
        propertyId: 'prop-001',
        buyerId: 'buyer-001',
        sellerId: 'seller-001',
        amount: 250000,
        currency: 'USD',
      })
      .expect(201);

    const txnId = createRes.body.id;
    expect(txnId).toBeDefined();
    expect(createRes.body.status).toBe('PENDING');

    // Step 2: Record on blockchain (simulate admin action)
    const recordRes = await request(app.getHttpServer())
      .post(`/transactions/${txnId}/record-blockchain`)
      .set('Authorization', 'Bearer test')
      .expect(200);

    expect(recordRes.body.blockchainTxHash).toBe('0xabc123def456');

    // Step 3: Verify on-chain record
    const verifyRes = await request(app.getHttpServer())
      .get(`/transactions/${txnId}/verify-blockchain`)
      .set('Authorization', 'Bearer test')
      .expect(200);

    expect(verifyRes.body.verified).toBe(true);
    expect(verifyRes.body.blockNumber).toBe(12345);
  });
});
