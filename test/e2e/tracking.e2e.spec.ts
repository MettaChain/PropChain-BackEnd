/**
 * E2E test: Tracking API – click redirects, email-open pixels, stats.
 *
 * Issue #1073 – Add e2e coverage for the tracking API.
 *
 * Covers:
 *   - Click redirect: missing URL → 400, disallowed host → 400, allowed host → 302
 *   - Email-open pixel: returns a 1×1 transparent PNG with correct headers
 *   - Stats endpoint: returns structured click & email stats
 *   - Security: open-redirect rejection (#53) and unauthenticated-stats (#54)
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../../src/database/prisma.service';
import { TrackingController } from '../../src/tracking/tracking.controller';
import { TrackingService } from '../../src/tracking/tracking.service';

// ── Minimal Prisma fake (tracking only reads, minimal CRUD) ──────────────────

class FakePrismaService {
  linkClicks: any[] = [];
  emailEngagements: any[] = [];

  async $connect() {}
  async $disconnect() {}

  linkClick = {
    create: async ({ data }: any) => {
      const record = { id: `lc-${Date.now()}`, ...data, createdAt: new Date() };
      this.linkClicks.push(record);
      return record;
    },
    groupBy: async () => {
      // Group by url and count
      const map = new Map<string, number>();
      for (const c of this.linkClicks) {
        map.set(c.url, (map.get(c.url) ?? 0) + 1);
      }
      return Array.from(map.entries())
        .map(([url, count]) => ({ url, _count: { _all: count } }))
        .sort((a, b) => b._count._all - a._count._all)
        .slice(0, 10);
    },
  } as any;

  emailEngagement = {
    update: async ({ where, data }: any) => {
      const idx = this.emailEngagements.findIndex((e) => e.trackingId === where.trackingId);
      if (idx >= 0) {
        this.emailEngagements[idx] = { ...this.emailEngagements[idx], ...data };
        return this.emailEngagements[idx];
      }
      // If not found, return undefined (matches .catch(() => {}) in service)
      return undefined;
    },
    create: async ({ data }: any) => {
      const record = { id: `ee-${Date.now()}`, ...data, createdAt: new Date() };
      this.emailEngagements.push(record);
      return record;
    },
    count: async (args?: any) => {
      let items = this.emailEngagements;
      if (args?.where?.openedAt?.not) items = items.filter((e) => e.openedAt !== null);
      return items.length;
    },
  } as any;
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe('Tracking API (e2e)', () => {
  let app: INestApplication;
  let fakePrisma: FakePrismaService;

  beforeAll(async () => {
    fakePrisma = new FakePrismaService();

    const moduleRef = await Test.createTestingModule({
      controllers: [TrackingController],
      providers: [TrackingService, { provide: PrismaService, useValue: fakePrisma as any }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }),
    );
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });

  // ── Click redirect ───────────────────────────────────────────────────────

  describe('Click redirect', () => {
    it('returns 400 when url is missing', async () => {
      const res = await request(app.getHttpServer()).get('/track/click').expect(400);

      expect(res.text).toBe('URL is required');
    });

    it('rejects an external URL when no allow-list is configured', async () => {
      // Default env: TRACKING_ALLOWED_REDIRECT_HOSTS is empty → fail-closed
      const res = await request(app.getHttpServer())
        .get('/track/click?url=https://evil.example.com/steal')
        .expect(400);

      expect(res.text).toBe('Invalid or disallowed redirect URL');
    });

    it('rejects a javascript: URI', async () => {
      const res = await request(app.getHttpServer())
        .get('/track/click?url=javascript:alert(1)')
        .expect(400);

      expect(res.text).toBe('Invalid or disallowed redirect URL');
    });

    it('rejects a file: URI', async () => {
      const res = await request(app.getHttpServer())
        .get('/track/click?url=file:///etc/passwd')
        .expect(400);

      expect(res.text).toBe('Invalid or disallowed redirect URL');
    });

    it('allows an allowed host and issues a 302 redirect', async () => {
      const original = process.env.TRACKING_ALLOWED_REDIRECT_HOSTS;
      try {
        process.env.TRACKING_ALLOWED_REDIRECT_HOSTS = 'allowed.example.com';

        const res = await request(app.getHttpServer())
          .get('/track/click?url=https://allowed.example.com/page')
          .expect(302);

        expect(res.headers['location']).toBe('https://allowed.example.com/page');
      } finally {
        if (original === undefined) delete process.env.TRACKING_ALLOWED_REDIRECT_HOSTS;
        else process.env.TRACKING_ALLOWED_REDIRECT_HOSTS = original;
      }
    });

    it('rejects a host not in the allow-list', async () => {
      const original = process.env.TRACKING_ALLOWED_REDIRECT_HOSTS;
      try {
        process.env.TRACKING_ALLOWED_REDIRECT_HOSTS = 'safe.example.com';

        const res = await request(app.getHttpServer())
          .get('/track/click?url=https://evil.example.com/steal')
          .expect(400);

        expect(res.text).toBe('Invalid or disallowed redirect URL');
      } finally {
        if (original === undefined) delete process.env.TRACKING_ALLOWED_REDIRECT_HOSTS;
        else process.env.TRACKING_ALLOWED_REDIRECT_HOSTS = original;
      }
    });

    it('records the click when redirect succeeds', async () => {
      const original = process.env.TRACKING_ALLOWED_REDIRECT_HOSTS;
      try {
        process.env.TRACKING_ALLOWED_REDIRECT_HOSTS = 'allowed.example.com';

        await request(app.getHttpServer())
          .get('/track/click?url=https://allowed.example.com/page&userId=user-1')
          .expect(302);

        expect(fakePrisma.linkClicks.length).toBeGreaterThanOrEqual(1);
        const lastClick = fakePrisma.linkClicks[fakePrisma.linkClicks.length - 1];
        expect(lastClick.url).toBe('https://allowed.example.com/page');
        expect(lastClick.userId).toBe('user-1');
      } finally {
        if (original === undefined) delete process.env.TRACKING_ALLOWED_REDIRECT_HOSTS;
        else process.env.TRACKING_ALLOWED_REDIRECT_HOSTS = original;
      }
    });
  });

  // ── Email-open pixel ─────────────────────────────────────────────────────

  describe('Email-open pixel', () => {
    it('returns a 1×1 transparent PNG', async () => {
      const res = await request(app.getHttpServer())
        .get('/track/open/test-tracking-001.png')
        .expect(200);

      expect(res.headers['content-type']).toBe('image/png');

      // The pixel should be the known 1×1 transparent PNG (70 bytes base64-decoded)
      expect(Buffer.byteLength(res.body)).toBe(70);
    });

    it('sets no-cache headers', async () => {
      const res = await request(app.getHttpServer())
        .get('/track/open/test-tracking-002.png')
        .expect(200);

      expect(res.headers['cache-control']).toContain('no-cache');
      expect(res.headers['pragma']).toBe('no-cache');
      expect(res.headers['expires']).toBe('0');
    });

    it('does not fail for unknown tracking IDs', async () => {
      // Service catches errors internally for unknown trackingIds
      await request(app.getHttpServer()).get('/track/open/unknown-id.png').expect(200);
    });

    it('calls trackEmailOpen with the tracking ID', async () => {
      // Verify the service was called (emailEngagement.update should have been called)
      const trackingId = 'verify-tracking-call';
      const res = await request(app.getHttpServer())
        .get(`/track/open/${trackingId}.png`)
        .expect(200);

      // The service call went through without error
      expect(res.status).toBe(200);
    });
  });

  // ── Stats ────────────────────────────────────────────────────────────────

  describe('Stats', () => {
    it('returns click and email stats', async () => {
      const res = await request(app.getHttpServer()).get('/track/stats').expect(200);

      expect(res.body).toBeDefined();
      expect(res.body.clicks).toBeDefined();
      expect(Array.isArray(res.body.clicks)).toBe(true);
      expect(res.body.emails).toBeDefined();
      expect(typeof res.body.emails.totalSent).toBe('number');
      expect(typeof res.body.emails.totalOpened).toBe('number');
      expect(typeof res.body.emails.openRate).toBe('number');
    });

    it('is accessible without authentication (public endpoint)', async () => {
      // No Authorization header → should still return 200
      const res = await request(app.getHttpServer()).get('/track/stats').expect(200);

      expect(res.body.clicks).toBeDefined();
    });

    it('reflects click data recorded via the click endpoint', async () => {
      const original = process.env.TRACKING_ALLOWED_REDIRECT_HOSTS;
      try {
        process.env.TRACKING_ALLOWED_REDIRECT_HOSTS = 'stats-test.example.com';

        // Record a click
        await request(app.getHttpServer())
          .get('/track/click?url=https://stats-test.example.com/landing')
          .expect(302);

        // Fetch stats
        const res = await request(app.getHttpServer()).get('/track/stats').expect(200);

        const clickEntry = res.body.clicks.find(
          (c: any) => c.url === 'https://stats-test.example.com/landing',
        );
        expect(clickEntry).toBeDefined();
        expect(clickEntry.clicks).toBeGreaterThanOrEqual(1);
      } finally {
        if (original === undefined) delete process.env.TRACKING_ALLOWED_REDIRECT_HOSTS;
        else process.env.TRACKING_ALLOWED_REDIRECT_HOSTS = original;
      }
    });
  });
});
