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
  activityLogs = new Map<string, any>();

  async $connect() {}
  async $disconnect() {}

  activityLog = {
    create: async ({ data }: any) => {
      const id = `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const record = { id, ...data, createdAt: new Date() };
      this.activityLogs.set(id, record);
      return record;
    },
    findMany: async ({ where }: any) => {
      let items = Array.from(this.activityLogs.values());
      if (where?.userId) items = items.filter((a) => a.userId === where.userId);
      if (where?.entityId) items = items.filter((a) => a.entityId === where.entityId);
      if (where?.action) items = items.filter((a) => a.action === where.action);
      return items;
    },
  } as any;

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
    findUnique: async ({ where }: any) => this.deliveryLogs.get(where.id) ?? null,
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
  let capturedRequests: { method: string; headers: http.IncomingHttpHeaders; body: string }[] = [];

  beforeAll(async () => {
    process.env.WEBHOOK_DEV_ALLOWLIST = '127.0.0.1';
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
          } else if (req.url?.includes('/slow-webhook')) {
            // Slow delivery simulation
            setTimeout(() => {
              res.writeHead(200);
              res.end(JSON.stringify({ received: true }));
            }, 300);
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
    const challengeRequest = capturedRequests.find((r) => r.method === 'GET' && r.body === '');
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

    // Wait for the asynchronous delivery to arrive at the receiver
    const waitForRequest = async (predicate: (r: any) => boolean, timeoutMs = 2000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const found = capturedRequests.find(predicate);
        if (found) return found;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return capturedRequests.find(predicate);
    };

    const postRequest = await waitForRequest((r) => r.method === 'POST');
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

    const waitForDelivery = async (webhookId: string, timeoutMs = 2000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const logs = await fakePrisma.webhookDeliveryLog.findMany({ where: { webhookId } });
        if (logs.length > 0 && logs[0].status === 'SUCCESS') return logs;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return fakePrisma.webhookDeliveryLog.findMany({ where: { webhookId } });
    };

    await waitForDelivery(wh.id);

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
    await request(app.getHttpServer())
      .get('/webhooks')
      .expect((res) => {
        expect([401, 403]).toContain(res.status);
      });
    await request(app.getHttpServer())
      .post('/webhooks')
      .expect((res) => {
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

  describe('Secret Rotation (#1255)', () => {
    it('rotates secret, returns new secret once, records audit, and rejects old signature', async () => {
      // 1. Create a webhook
      const createRes = await request(app.getHttpServer())
        .post('/webhooks')
        .set('Authorization', 'Bearer valid')
        .send({
          url: `http://127.0.0.1:${receiverPort}/rotation-test`,
          eventTypes: ['TRANSACTION_COMPLETED'],
          description: 'Rotation test webhook',
        })
        .expect(201);

      const webhookId = createRes.body.id;
      const initialSecret = createRes.body.secret;
      expect(initialSecret).toBeDefined();

      // 2. Rotate secret via POST /webhooks/:id/rotate-secret
      const rotateRes = await request(app.getHttpServer())
        .post(`/webhooks/${webhookId}/rotate-secret`)
        .set('Authorization', 'Bearer valid')
        .expect(201);

      const newSecret = rotateRes.body.secret;
      expect(newSecret).toBeDefined();
      expect(newSecret).not.toBe(initialSecret);
      expect(newSecret.length).toBeGreaterThanOrEqual(32);

      // 3. Verify audit log was recorded
      const auditLogs = await fakePrisma.activityLog.findMany({
        where: { entityId: webhookId, action: 'WEBHOOK_SECRET_ROTATED' },
      });
      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
      expect(auditLogs[0].userId).toBe(TEST_USER_ID);
      expect(auditLogs[0].entityType).toBe('WEBHOOK');

      // 4. Trigger delivery and verify it is signed with the NEW secret, NOT the old secret
      capturedRequests = [];
      const service = app.get(WebhooksService);
      await service.trigger('TRANSACTION_COMPLETED', { txId: 'tx-123', amount: 5000 });

      const postRequest = capturedRequests.find((r) => r.method === 'POST');
      expect(postRequest).toBeDefined();

      const deliveredSignature = postRequest!.headers['x-webhook-signature'];
      expect(deliveredSignature).toBeDefined();

      // Verify delivery includes idempotency key header (#1256)
      expect(postRequest!.headers['x-webhook-idempotency-key']).toBeDefined();

      // Recompute with NEW secret -> matches
      const expectedNewSignature = crypto
        .createHmac('sha256', newSecret)
        .update(postRequest!.body)
        .digest('hex');
      expect(deliveredSignature).toBe(expectedNewSignature);

      // Recompute with OLD secret -> does NOT match (old signatures rejected)
      const expectedOldSignature = crypto
        .createHmac('sha256', initialSecret)
        .update(postRequest!.body)
        .digest('hex');
      expect(deliveredSignature).not.toBe(expectedOldSignature);
    });
  });

  describe('Retry Backoff Schedule (#1256)', () => {
    it('uses 0-based delay mapping matching documented backoff schedule', () => {
      const service = app.get(WebhooksService);

      // Attempt 1 (1st retry): 1,000ms (1s)
      expect(service.getRetryDelay(1)).toBe(1000);
      // Attempt 2 (2nd retry): 5,000ms (5s)
      expect(service.getRetryDelay(2)).toBe(5000);
      // Attempt 3 (3rd retry): 15,000ms (15s)
      expect(service.getRetryDelay(3)).toBe(15000);
      // Attempt 4 (4th retry): 60,000ms (60s)
      expect(service.getRetryDelay(4)).toBe(60000);
      // Attempt 5 (5th retry): 300,000ms (300s)
      expect(service.getRetryDelay(5)).toBe(300000);
      // Out of bounds / capped at last
      expect(service.getRetryDelay(6)).toBe(300000);
    });
  it('rejects registration of internal, private, and cloud metadata URLs (SSRF protection #1253)', async () => {
    const blockedUrls = [
      'http://169.254.169.254/latest/meta-data',
      'http://10.0.0.1/hook',
      'http://192.168.1.1/hook',
      'http://172.16.0.1/hook',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://localhost:5432/webhook',
    ];

    for (const url of blockedUrls) {
      await request(app.getHttpServer())
        .post('/webhooks')
        .set('Authorization', 'Bearer valid')
        .send({
          url,
          eventTypes: ['PROPERTY_CREATED'],
          description: 'Blocked target',
        })
        .expect(400);
    }
  });

  it('returns immediately without waiting for slow webhook delivery (caller latency independence #1254)', async () => {
    // Register a webhook pointing to the slow receiver path
    const slowPath = '/slow-webhook';
    await request(app.getHttpServer())
      .post('/webhooks')
      .set('Authorization', 'Bearer valid')
      .send({
        url: `http://127.0.0.1:${receiverPort}${slowPath}`,
        eventTypes: ['PROPERTY_UPDATED'],
        description: 'Slow receiver webhook',
      })
      .expect(201);

    const service = app.get(WebhooksService);
    const start = Date.now();
    await service.trigger('PROPERTY_UPDATED', { propertyId: 'p-slow' });
    const triggerDuration = Date.now() - start;

    // Caller latency is bounded by enqueue time and returns well before the 300ms slow delivery completes
    expect(triggerDuration).toBeLessThan(150);
  });
});
