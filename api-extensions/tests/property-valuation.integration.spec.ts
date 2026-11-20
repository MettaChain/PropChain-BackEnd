import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../../src/database/prisma.service';
import { PropertyValuationController } from '../modules/property-valuation/property-valuation.controller';
import { PropertyValuationService } from '../modules/property-valuation/property-valuation.service';

describe('PropertyValuationModule (integration)', () => {
  const propertyId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
  const property = {
    id: propertyId,
    address: '12 Main Street',
    price: 500000,
    taxAssessmentValue: 480000,
    priceHistory: [
      { oldPrice: 470000, newPrice: 495000, createdAt: new Date('2026-01-01') },
      { oldPrice: 450000, newPrice: 470000, createdAt: new Date('2025-07-01') },
    ],
  };

  let app: INestApplication;
  let findUnique: jest.Mock;

  beforeAll(async () => {
    findUnique = jest.fn().mockResolvedValue(property);
    const moduleRef = await Test.createTestingModule({
      controllers: [PropertyValuationController],
      providers: [
        PropertyValuationService,
        { provide: PrismaService, useValue: { property: { findUnique } } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  beforeEach(() => {
    findUnique.mockClear();
    findUnique.mockResolvedValue(property);
    app.get(PropertyValuationService).clearCache();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /property-valuation/:propertyId returns a valuation with comparables', async () => {
    const response = await request(app.getHttpServer())
      .get(`/property-valuation/${propertyId}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        propertyId,
        estimatedValue: expect.any(Number),
        confidence: expect.any(Number),
        comparableCount: 2,
        comparables: expect.any(Array),
        valuationDate: expect.any(String),
        metadata: expect.objectContaining({ method: 'comparable-sales' }),
      }),
    );
    expect(response.body.confidence).toBeGreaterThan(0);
    expect(response.body.confidence).toBeLessThanOrEqual(100);
    expect(response.body.comparables[0]).toEqual(
      expect.objectContaining({ address: '12 Main Street', salePrice: 495000 }),
    );
  });

  it('returns 404 for a non-existent property', async () => {
    findUnique.mockResolvedValueOnce(null);
    await request(app.getHttpServer()).get(`/property-valuation/${propertyId}`).expect(404);
  });

  it('returns 400 for an invalid property ID', async () => {
    await request(app.getHttpServer()).get('/property-valuation/not-a-uuid').expect(400);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('caches valuations across requests', async () => {
    await request(app.getHttpServer()).get(`/property-valuation/${propertyId}`).expect(200);
    await request(app.getHttpServer()).get(`/property-valuation/${propertyId}`).expect(200);

    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('bypasses the cache when refresh=true is supplied', async () => {
    await request(app.getHttpServer()).get(`/property-valuation/${propertyId}`).expect(200);
    await request(app.getHttpServer())
      .get(`/property-valuation/${propertyId}`)
      .query({ refresh: true })
      .expect(200);

    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('POST /property-valuation uses the supplied comparables', async () => {
    const comparables = [
      {
        address: '8 Oak Avenue',
        salePrice: 600000,
        saleDate: '2026-02-01T00:00:00.000Z',
        distance: 0.4,
        similarityScore: 90,
      },
    ];

    const response = await request(app.getHttpServer())
      .post('/property-valuation')
      .send({ propertyId, comparables, notes: 'nearby sale' })
      .expect(201);

    expect(response.body.comparableCount).toBe(1);
    expect(response.body.comparables[0].salePrice).toBe(600000);
    expect(response.body.estimatedValue).toBe(600000);
  });

  it('falls back to the assessed value when the property has no price history', async () => {
    findUnique.mockResolvedValueOnce({ ...property, priceHistory: [], taxAssessmentValue: 480000 });
    const valuation = await app.get(PropertyValuationService).getValuation(propertyId);

    expect(valuation.comparableCount).toBe(1);
    expect(valuation.estimatedValue).toBe(480000);
    expect(valuation.metadata?.method).toBe('comparable-sales');
  });

  it('falls back to the listing price when no comparables are available', async () => {
    findUnique.mockResolvedValueOnce({ ...property, priceHistory: [], taxAssessmentValue: null });
    const valuation = await app.get(PropertyValuationService).getValuation(propertyId);

    expect(valuation.estimatedValue).toBe(500000);
    expect(valuation.confidence).toBe(20);
    expect(valuation.metadata?.method).toBe('listing-price');
  });

  it('rejects invalid identifiers at the service boundary', async () => {
    await expect(app.get(PropertyValuationService).getValuation('invalid')).rejects.toThrow(
      'Invalid property ID',
    );
  });

  it('clears cached valuations for one property or all properties', async () => {
    const service = app.get(PropertyValuationService);
    await service.getValuation(propertyId);
    service.clearCache(propertyId);
    await service.getValuation(propertyId);
    service.clearCache();
    await service.getValuation(propertyId);

    expect(findUnique).toHaveBeenCalledTimes(3);
  });

  it('generates Swagger documentation for the valuation endpoints', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('PropChain API').setVersion('2.0.0').build(),
    );

    expect(document.paths).toHaveProperty('/property-valuation/{propertyId}.get');
    expect(document.paths).toHaveProperty('/property-valuation.post');
    expect(JSON.stringify(document.components?.schemas)).toContain('ValuationResponseDto');
  });
});
