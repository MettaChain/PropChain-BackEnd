import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { ValuationService } from '../../src/valuation/valuation.service';
import { Decimal } from '@prisma/client/runtime/library';

describe('ValuationService', () => {
  let service: ValuationService;
  let configService: ConfigService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ValuationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            property: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            propertyValuation: {
              create: jest.fn(),
              findMany: jest.fn(),
              groupBy: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ValuationService>(ValuationService);
    configService = module.get<ConfigService>(ConfigService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('normalizeFeatures', () => {
    it('should normalize property features correctly', () => {
      const features = {
        id: 'test-id',
        location: '  NEW YORK, NY  ',
        bedrooms: '3',
        bathrooms: '2.5',
        squareFootage: '1500',
        yearBuilt: '1990',
        lotSize: '0.25',
      };

      const normalized = (service as any).normalizeFeatures(features);

      expect(normalized.location).toBe('new york, ny');
      expect(normalized.bedrooms).toBe(3);
      expect(normalized.bathrooms).toBe(2.5);
      expect(normalized.squareFootage).toBe(1500);
      expect(normalized.yearBuilt).toBe(1990);
      expect(normalized.lotSize).toBe(0.25);
    });

    it('should set default values for missing numeric fields', () => {
      const features = {
        id: 'test-id',
        location: 'Test Location',
      };

      const normalized = (service as any).normalizeFeatures(features);

      expect(normalized.bedrooms).toBe(0);
      expect(normalized.bathrooms).toBe(0);
      expect(normalized.squareFootage).toBe(0);
      expect(normalized.yearBuilt).toBe(0);
      expect(normalized.lotSize).toBe(0);
    });
  });

  describe('combineValuations', () => {
    it('should return single valuation if only one is provided', () => {
      const valuations = [
        {
          propertyId: 'test-prop',
          estimatedValue: 500000,
          confidenceScore: 0.9,
          valuationDate: new Date(),
          source: 'test-source',
        },
      ];

      const result = (service as any).combineValuations(valuations);

      expect(result.estimatedValue).toBe(500000);
      expect(result.confidenceScore).toBe(0.9);
    });

    it('should combine multiple valuations using weighted average', () => {
      const valuations = [
        {
          propertyId: 'test-prop',
          estimatedValue: 500000,
          confidenceScore: 0.8,
          valuationDate: new Date(),
          source: 'source1',
        },
        {
          propertyId: 'test-prop',
          estimatedValue: 550000,
          confidenceScore: 0.9,
          valuationDate: new Date(),
          source: 'source2',
        },
      ];

      const result = (service as any).combineValuations(valuations);

      // Should be weighted toward the higher confidence score
      expect(result.estimatedValue).toBeGreaterThan(500000);
      expect(result.estimatedValue).toBeLessThan(550000);
      expect(result.confidenceScore).toBeCloseTo(0.85, 1); // Average of 0.8 and 0.9
    });
  });

  describe('getMarketTrendFromValuations', () => {
    it('should return neutral if no trends provided', () => {
      const result = (service as any).getMarketTrendFromValuations([]);
      expect(result).toBe('neutral');
    });

    it('should return majority trend', () => {
      const valuations = [
        { marketTrend: 'upward' },
        { marketTrend: 'upward' },
        { marketTrend: 'downward' },
      ].map(v => ({ ...v as any, propertyId: 'test', estimatedValue: 0, confidenceScore: 0, valuationDate: new Date(), source: 'test' }));

      const result = (service as any).getMarketTrendFromValuations(valuations);
      expect(result).toBe('upward');
    });
  });
});