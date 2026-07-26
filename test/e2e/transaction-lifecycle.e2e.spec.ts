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
import { TransactionNotesService } from '../../src/transactions/transaction-notes.service';
import { TransactionRemindersService } from '../../src/transactions/transaction-reminders.service';
import { TransactionAuditService } from '../../src/transactions/transaction-audit.service';
import { TransactionFeesService } from '../../src/transactions/transaction-fees.service';
import { TimelineService } from '../../src/transactions/timeline.service';
import { BlockchainService } from '../../src/blockchain/blockchain.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { CommissionsService } from '../../src/commissions/commissions.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
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
  users = new Map<string, any>();
  properties = new Map<string, any>();

  async $connect() {}
  async $disconnect() {}

  user = {
    findUnique: async ({ where }: any) => this.users.get(where.id) ?? null,
  };

  property = {
    findUnique: async ({ where }: any) => this.properties.get(where.id) ?? null,
  };

  transaction = {
    create: async ({ data }: any) => {
      const id = data.id ?? 'txn-' + Math.random().toString(36).slice(2, 8);
      const amountDecimal = {
        value: Number(data.amount),
        toNumber: () => Number(data.amount),
        toString: () => String(data.amount),
      };
      const record = {
        id,
        ...data,
        amount: amountDecimal,
        status: data.status ?? 'PENDING',
        blockchainHash: null,
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

const mockNotificationsService = {
  handleTransactionUpdate: async () => {},
  sendNotification: async () => ({}),
};

const mockCommissionsService = {
  calculateCommission: async () => ({ amount: 0, rate: 0 }),
  createCommissionsForTransaction: async () => ({}),
  updateCommissionsStatus: async () => ({}),
};

const mockTransactionFeesService = {
  calculateFees: () => ({ platformFee: 0, agentCommission: 0, total: 0 }),
};

const mockTimelineService = {
  addMilestone: async () => ({}),
  addStageEvent: async () => ({}),
};

const mockTransactionAuditService = {
  log: async () => ({}),
};

const mockTransactionNotesService = {
  create: async () => ({}),
  findByTransaction: async () => [],
  remove: async () => ({}),
};

const mockTransactionRemindersService = {
  sendReminders: async () => [],
};

describe('Transaction Lifecycle e2e', () => {
  let app: INestApplication;
  let fakePrisma: FakePrismaService;

  beforeAll(async () => {
    fakePrisma = new FakePrismaService();

    // Seed fake data for lookups (UUID format required by DTOs)
    fakePrisma.users.set('11111111-1111-4111-b111-111111111111', { id: '11111111-1111-4111-b111-111111111111', email: 'buyer@test.com' });
    fakePrisma.users.set('22222222-2222-4222-b222-222222222222', { id: '22222222-2222-4222-b222-222222222222', email: 'seller@test.com' });
    fakePrisma.properties.set('33333333-3333-4333-b333-333333333333', { id: '33333333-3333-4333-b333-333333333333', address: '123 Test St' });

    const moduleRef = await Test.createTestingModule({
      controllers: [TransactionsController],
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: fakePrisma as any },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService as any,
        },
        {
          provide: CommissionsService,
          useValue: mockCommissionsService as any,
        },
        {
          provide: TransactionFeesService,
          useValue: mockTransactionFeesService as any,
        },
        {
          provide: TimelineService,
          useValue: mockTimelineService as any,
        },
        {
          provide: TransactionAuditService,
          useValue: mockTransactionAuditService as any,
        },
        {
          provide: TransactionNotesService,
          useValue: mockTransactionNotesService as any,
        },
        {
          provide: TransactionRemindersService,
          useValue: mockTransactionRemindersService as any,
        },
        {
          provide: BlockchainService,
          useValue: {
            recordTransactionOnBlockchain: async () => ({
              blockchainHash: '0xabc123def456',
              contractAddress: '0xcontract123',
            }),
            verifyBlockchainTransaction: async () => ({
              verified: true,
              status: 'success',
              blockNumber: 12345,
              timestamp: new Date().toISOString(),
            }),
            isValidAddress: () => true,
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

  it('full lifecycle: create → record on blockchain → verify', async () => {
    // Step 1: Create a transaction
    const createRes = await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', 'Bearer test')
      .send({
        propertyId: '33333333-3333-4333-b333-333333333333',
        buyerId: '11111111-1111-4111-b111-111111111111',
        sellerId: '22222222-2222-4222-b222-222222222222',
        amount: 250000,
        type: 'SALE',
      })
      .expect(201);

    const txnId = createRes.body.id;
    expect(txnId).toBeDefined();
    expect(createRes.body.status).toBe('PENDING');

    // Step 2: Record on blockchain (simulate admin action)
    const recordRes = await request(app.getHttpServer())
      .post(`/transactions/${txnId}/record-on-blockchain`)
      .set('Authorization', 'Bearer test')
      .send({})
      .expect(200);

    expect(recordRes.body.blockchain.blockchainHash).toBe('0xabc123def456');

    // Step 3: Verify on-chain record
    const verifyRes = await request(app.getHttpServer())
      .get(`/transactions/${txnId}/verify-blockchain`)
      .set('Authorization', 'Bearer test')
      .expect(200);

    expect(verifyRes.body.verified).toBe(true);
    expect(verifyRes.body.blockNumber).toBe(12345);
  });
});
