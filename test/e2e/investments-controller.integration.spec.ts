/**
 * Integration tests: InvestmentsController over HTTP with a mocked CacheService.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { InvestmentsController } from '../../src/investments/investments.controller';
import { InvestmentsService } from '../../src/investments/investments.service';
import {
  InvestmentRateLimitGuard,
  INVESTMENT_RATE_LIMIT,
} from '../../src/investments/investment-rate-limit.guard';
import { CacheService } from '../../src/cache/cache.service';

describe('InvestmentsController (integration)', () => {
  let app: INestApplication;
  const cacheService = {
    getOrSetLegacy: jest.fn((_key: string, factory: () => Promise<unknown>) => factory()),
    invalidateByTag: jest.fn().mockResolvedValue({ success: true }),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [InvestmentsController],
      providers: [
        InvestmentsService,
        InvestmentRateLimitGuard,
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  it('creates and fetches an investment', async () => {
    const created = await request(app.getHttpServer())
      .post('/investments')
      .send({ propertyId: 'property-1', amount: 1000 })
      .expect(201);

    expect(cacheService.invalidateByTag).toHaveBeenCalledWith('investments');

    const fetched = await request(app.getHttpServer())
      .get(`/investments/${created.body.id}`)
      .expect(200);
    expect(fetched.body.amount).toBe(1000);

    const list = await request(app.getHttpServer()).get('/investments').expect(200);
    expect(list.body).toHaveLength(1);
  });

  it('returns 400 for invalid payload', async () => {
    await request(app.getHttpServer())
      .post('/investments')
      .send({ propertyId: 'p', amount: -5 })
      .expect(400);
  });

  it('returns 404 for unknown investment', async () => {
    await request(app.getHttpServer()).get('/investments/missing').expect(404);
  });

  it('returns 429 when the rate limit is exceeded', async () => {
    for (let i = 0; i < INVESTMENT_RATE_LIMIT.max; i++) {
      await request(app.getHttpServer()).get('/investments').expect(200);
    }
    await request(app.getHttpServer()).get('/investments').expect(429);
  });
});
