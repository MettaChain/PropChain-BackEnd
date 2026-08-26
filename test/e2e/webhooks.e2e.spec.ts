/**
 * E2E test: Webhook registration → challenge verification → signed delivery.
 *
 * Issue #1071 – Add e2e coverage for the webhook API.
 *
 * Covers:
 *   - Register a webhook and receive the plaintext secret
 *   - Challenge verification via a local HTTP receiver
 *   - Signed delivery: trigger a delivery, capture the POST, verify
 *     the X-Webhook-Signature header by recomputing HMAC-SHA256
 *   - Delivery log is persisted and retrievable
 */

import {
  INestApplication,
  ValidationPipe,
  Injectable,
  CanActivate,
  ExecutionContext,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as http from 'http';
import * as crypto from 'crypto';
import * as request from 'supertest';
import { PrismaService } from '../../src/database/prisma.service';
import { WebhooksController } from '../../src/webhooks/webhooks.controller';
import { WebhooksService } from '../../src/webhooks/webhooks.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { AuthUserPayload } from '../../src/auth/types/auth-user.type';

const TEST_USER_ID = 'wh-user-e2e';
const TEST_WEBHOOK_URL_PATH = '/webhook';

// ── Mock auth guard ──────────────────────────────────────────────────────────

@Injectable()
class MockJwtAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (!req.headers['authorization']) return false;
    req.user = {
      sub: TEST_USER_ID,
      email: 'wh-test@example.com',
      role: 'USER',
      type: 'access',
    } as AuthUserPayload;
    req.user.id = TEST_USER_ID;
    req.authUser = req.user;
    return true;
  }
}

// ── Minimal Prisma fake for webhooks ─────────────────────────────────────────

class FakePrismaService {
  webhooks = new Map<string, any>();
  deliveryLogs = new Map<string, any>();

  async $connect() {}
  async $disconnect() {}

  webhook = {
    create: async ({ data }: any) => {
      const id = `wh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const record = {
        id,
        userId: data.userId,
        url: data.url,
        secret: data.secret,
        events: data.events,
        description: data.description ?? null,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.webhooks.set(id, record);
      return record;
    },
    findUnique: async ({ where }: any) => this.webhooks.get(where.id) ?? null,
    findFirst: async ({ where }: any) => {
      for (const w of this.webhooks.values()) {
        if (w.id === where.id && w.userId === where.userId) return w;
      }
      return null;
    },
    findMany: async ({ where }: any) => {
      let items = Array.from(this.webhooks.values());
      if (where?.userId) items = items.filter((w) => w.userId === where.userId);
      if (where?.status) items = items.filter((w) => w.status === where.status);
      if (where?.events?.has) items = items.filter((w) => w.events.includes(where.events.has));
      return items;
    },
    update: async ({ where, data }: any) => {
      const w = this.webhooks.get(where.id);
      if (!w) throw new Error(`Webhook ${where.id} not found`);
      const updated = { ...w, ...data, updatedAt: new Date() };
      this.webhooks.set(where.id, updated);
      return updated;
    },
    delete: async ({ where }: any) => {
      const w = this.webhooks.get(where.id);
      this.webhooks.delete(where.id);
      return w;
    },
  } as any;

  webhookDeliveryLog = {
    create: async ({ data }: any) => {
      const id = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const record = {
        id,
        webhookId: data.webhookId,
        eventType: data.eventType,
        payload: data.payload,
        status: data.status ?? 'PENDING',
        responseCode: null,
        responseBody: null,
        attempts: data.attempts ?? 0,
        maxAttempts: data.maxAttempts ?? 5,
        nextRetryAt: null,
        error: null,
        deliveredAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.deliveryLogs.set(id, record);
      return record;
    },
    findMany: async ({ where }: any) => {
      let items = Array.from(this.deliveryLogs.values());
      if (where?.webhookId) items = items.filter((d) => d.webhookId === where.webhookId);
      if (where?.status) items = items.filter((d) => d.status === where.status);
      return items.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    },
    update: async ({ where, data }: any) => {
      const d = this.deliveryLogs.get(where.id);
      if (!d) throw new Error(`DeliveryLog ${where.id} not found`);
      const updated = { ...d, ...data, updatedAt: new Date() };
      this.deliveryLogs.set(where.id, updated);
      return updated;
    },
  } as any;
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe('Webhook workflow (e2e)', () => {
  let app: INestApplication;
  let fakePrisma: FakePrismaService;
  let receiverServer: http.Server;
  let receiverPort: number;
  let capturedRequests: { method: string; headers: http.IncomingHttpHeaders; body: string }[] =
    [];

  beforeAll(async () => {
    fakePrisma = new FakePrismaService();

    const moduleRef = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [WebhooksService, { provide: PrismaService, useValue: fakePrisma as any }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new MockJwtAuthGuard())
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }),
    );
    await app.init();

    // Spin up a local HTTP receiver to capture webhook deliveries
    await new Promise<void>((resolve) => {
      receiverServer = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          const url = new URL(req.url!, `http://localhost`);
          const captured = {
            method: req.method!,
            headers: req.headers,
            body,
          };
          capturedRequests.push(captured);

          res.setHeader('Content-Type', 'application/json');

          if (req.method === 'GET') {
            // Challenge verification: echo the challenge back
            const challenge = url.searchParams.get('challenge') ?? '';
            res.writeHead(200);
            res.end(JSON.stringify({ challenge }));
          } else {
            // Delivery: accept the webhook
            res.writeHead(200);
            res.end(JSON.stringify({ received: true }));
          }
        });
      });
      receiverServer.listen(0, '127.0.0.1', () => {
        receiverPort = (receiverServer.address() as any).port;
        resolve();
      });
    });
  }, 30000);

  afterAll(async () => {
    receiverServer?.close();
    await app?.close();
  });

  beforeEach(() => {
    capturedRequests = [];
  });

  it('registers a webhook and returns the secret', async () => {
    const res = await request(app.getHttpServer())
      .post('/webhooks')
      .set('Authorization', 'Bearer valid')
      .send({
        url: `http://127.0.0.1:${receiverPort}${TEST_WEBHOOK_URL_PATH}`,
        eventTypes: ['PROPERTY_CREATED', 'TRANSACTION_COMPLETED'],
        description: 'E2E test webhook',
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.url).toContain(String(receiverPort));
    expect(res.body.secret).toBeDefined();
    expect(typeof res.body.secret).toBe('string');
    expect(res.body.secret.length).toBeGreaterThanOrEqual(32);
    expect(res.body.status).toBe('ACTIVE');
  });

  it('lists registered webhooks', async () => {
    const res = await request(app.getHttpServer())
      .get('/webhooks')
      .set('Authorization', 'Bearer valid')
      .expect(200);

    const body = res.body?.data ?? res.body;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it('retrieves a single webhook by id', async () => {
    const webhooks = await fakePrisma.webhook.findMany({
      where: { userId: TEST_USER_ID },
    });
    const wh = webhooks[0];

    const res = await request(app.getHttpServer())
      .get(`/webhooks/${wh.id}`)
      .set('Authorization', 'Bearer valid')
      .expect(200);

    expect(res.body.id).toBe(wh.id);
    expect(res.body.url).toBe(wh.url);
  });

  it('verifies a challenge against a local receiver', async () => {
    const webhooks = await fakePrisma.webhook.findMany({
      where: { userId: TEST_USER_ID },
    });
    const wh = webhooks[0];

    const challenge = 'test-challenge-token-abc123';

    const res = await request(app.getHttpServer())
      .post(`/webhooks/${wh.id}/verify`)
      .set('Authorization', 'Bearer valid')
      .send({ challenge })
      .expect(201);

    expect(res.body.verified).toBe(true);

    // The receiver should have received a GET with the challenge query param
    const challengeRequest = capturedRequests.find(
      (r) => r.method === 'GET' && r.body === '',
    );
    expect(challengeRequest).toBeDefined();
  });

  it('triggers a signed delivery and verifies the signature', async () => {
    const webhooks = await fakePrisma.webhook.findMany({
      where: { userId: TEST_USER_ID },
    });
    const wh = webhooks[0];

    // Call the service's trigger method directly (no public controller endpoint)
    const service = app.get(WebhooksService);
    const eventPayload = {
      propertyId: 'prop-001',
      status: 'LISTED',
      price: 500000,
    };
    await service.trigger('PROPERTY_CREATED', eventPayload);

    // The receiver should have received a POST
    const postRequest = capturedRequests.find((r) => r.method === 'POST');
    expect(postRequest).toBeDefined();

    // Parse the delivered body
    const delivered = JSON.parse(postRequest!.body);
    expect(delivered.event).toBe('PROPERTY_CREATED');
    expect(delivered.payload).toEqual(eventPayload);
    expect(delivered.timestamp).toBeDefined();

    // Verify the signature header
    const signature = postRequest!.headers['x-webhook-signature'];
    expect(signature).toBeDefined();
    expect(typeof signature).toBe('string');

    // Recompute the expected HMAC-SHA256 using the registered secret
    const expectedSignature = crypto
      .createHmac('sha256', wh.secret)
      .update(postRequest!.body)
      .digest('hex');
    expect(signature).toBe(expectedSignature);

    // The event header should match
    expect(postRequest!.headers['x-webhook-event']).toBe('PROPERTY_CREATED');
  });

  it('persists a delivery log entry', async () => {
    const webhooks = await fakePrisma.webhook.findMany({
      where: { userId: TEST_USER_ID },
    });
    const wh = webhooks[0];

    const res = await request(app.getHttpServer())
      .get(`/webhooks/${wh.id}/deliveries`)
      .set('Authorization', 'Bearer valid')
      .expect(200);

    const deliveries = res.body?.data ?? res.body;
    expect(Array.isArray(deliveries)).toBe(true);
    expect(deliveries.length).toBeGreaterThanOrEqual(1);

    const latest = deliveries[0];
    expect(latest.webhookId).toBe(wh.id);
    expect(latest.eventType).toBe('PROPERTY_CREATED');
    expect(latest.status).toBe('SUCCESS');
    expect(latest.responseCode).toBe(200);
  });

  it('can delete a webhook', async () => {
    // Create a throwaway webhook to delete
    const createRes = await request(app.getHttpServer())
      .post('/webhooks')
      .set('Authorization', 'Bearer valid')
      .send({
        url: `http://127.0.0.1:${receiverPort}/delete-me`,
        eventTypes: ['PROPERTY_UPDATED'],
      })
      .expect(201);

    const id = createRes.body.id;

    await request(app.getHttpServer())
      .delete(`/webhooks/${id}`)
      .set('Authorization', 'Bearer valid')
      .expect(200);

    // Should now 404
    await request(app.getHttpServer())
      .get(`/webhooks/${id}`)
      .set('Authorization', 'Bearer valid')
      .expect(404);
  });

  it('rejects all webhook routes without auth', async () => {
    await request(app.getHttpServer()).get('/webhooks').expect((res) => {
      expect([401, 403]).toContain(res.status);
    });
    await request(app.getHttpServer()).post('/webhooks').expect((res) => {
      expect([401, 403]).toContain(res.status);
    });
  });

  it('returns 404 for a non-existent webhook', async () => {
    await request(app.getHttpServer())
      .get('/webhooks/nonexistent-id')
      .set('Authorization', 'Bearer valid')
      .expect(404);
  });

  it('produces a different signature for a different secret', async () => {
    const body = '{"event":"test","payload":{}}';
    const secretA = crypto.randomBytes(32).toString('hex');
    const secretB = crypto.randomBytes(32).toString('hex');

    const sigA = crypto.createHmac('sha256', secretA).update(body).digest('hex');
    const sigB = crypto.createHmac('sha256', secretB).update(body).digest('hex');

    expect(sigA).not.toBe(sigB);
  });

  it('produces consistent signatures for the same secret and body', () => {
    const body = '{"event":"test","payload":{"key":"value"}}';
    const secret = crypto.randomBytes(32).toString('hex');

    const sig1 = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const sig2 = crypto.createHmac('sha256', secret).update(body).digest('hex');

    expect(sig1).toBe(sig2);
  });
});
