import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  RiskSeverity,
  ScreeningRecommendation,
  ScreeningStatus,
} from '../modules/tenant-screening/dto/tenant-screening.dto';
import { TenantScreeningService } from '../modules/tenant-screening/tenant-screening.service';

const PRISMA_SERVICE = Symbol('PRISMA_SERVICE');
const CACHE_SERVICE = Symbol('CACHE_SERVICE');

interface ScreeningInternals {
  screenings: Map<string, Record<string, unknown>>;
}

function baseDto(overrides: Record<string, unknown> = {}) {
  return {
    applicantName: '  Jane Doe  ',
    applicantEmail: '  USER1@EXAMPLE.COM  ',
    propertyId: 'property-1',
    monthlyIncome: 3000,
    monthlyRent: 6000,
    consent: true,
    ...overrides,
  };
}

describe('TenantScreeningService (#1561)', () => {
  let service: TenantScreeningService;
  const prisma = {
    transaction: { findUnique: jest.fn(), findMany: jest.fn() },
  };
  const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantScreeningService,
        { provide: PRISMA_SERVICE, useValue: prisma },
        { provide: CACHE_SERVICE, useValue: cache },
      ],
    }).compile();
    service = module.get<TenantScreeningService>(TenantScreeningService);
  });

  function internals(): Map<string, Record<string, unknown>> {
    return (service as unknown as ScreeningInternals).screenings;
  }

  it('requires applicant consent before screening', () => {
    expect(() => service.create(baseDto({ consent: false }))).toThrow(BadRequestException);
    expect(() => service.create(baseDto({ consent: false }))).toThrow(
      'Applicant consent is required before screening',
    );
    expect(internals().size).toBe(0);
  });

  it('creates a pending screening with normalized applicant data', () => {
    const result = service.create(baseDto());

    expect(result.status).toBe(ScreeningStatus.PENDING);
    expect(result.propertyId).toBe('property-1');
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result).not.toHaveProperty('applicantName');
    expect(result).not.toHaveProperty('applicantEmail');
    const stored = internals().get(result.id);
    expect(stored).toMatchObject({
      applicantName: 'Jane Doe',
      applicantEmail: 'user1@example.com',
      monthlyIncome: 3000,
      monthlyRent: 6000,
      optOut: false,
    });
    expect(prisma.transaction.findUnique).not.toHaveBeenCalled();
    expect(cache.get).not.toHaveBeenCalled();
  });

  it('stores the privacy opt-out flag when supplied', () => {
    const result = service.create(baseDto({ optOut: true }));
    expect(internals().get(result.id)).toMatchObject({ optOut: true });
  });

  it('lists all screenings and filters by property', () => {
    const first = service.create(baseDto());
    const second = service.create(baseDto({ propertyId: 'property-2' }));

    expect(service.findAll()).toHaveLength(2);
    expect(service.findAll('property-2').map((item) => item.id)).toEqual([second.id]);
    expect(service.findAll('missing')).toEqual([]);
    expect(service.findAll()[0]).not.toBe(first);
  });

  it('finds a screening by id and throws for unknown ids', () => {
    const created = service.create(baseDto());

    expect(service.findOne(created.id)).toEqual(created);
    expect(() => service.findOne('missing')).toThrow(NotFoundException);
    expect(() => service.findOne('missing')).toThrow('Screening missing not found');
  });

  it('computes a deny recommendation with weighted risk factors', () => {
    const created = service.create(
      baseDto({
        applicantEmail: 'user1@example.com',
        monthlyIncome: 3000,
        monthlyRent: 6000,
      }),
    );

    const result = service.process(created.id);

    expect(result).toMatchObject({
      status: ScreeningStatus.COMPLETED,
      creditScore: 564,
      backgroundStatus: 'CLEAR',
      incomeVerified: false,
      overallScore: 47,
      recommendation: ScreeningRecommendation.DENY,
    });
    expect(result.riskFactors).toEqual([
      {
        factor: 'credit_score',
        severity: RiskSeverity.HIGH,
        description: 'Credit score is below the preferred threshold',
      },
      {
        factor: 'income_verification',
        severity: RiskSeverity.MEDIUM,
        description: 'Income does not meet the 2.5x rent guideline',
      },
      {
        factor: 'rent_to_income',
        severity: RiskSeverity.MEDIUM,
        description: 'Rent consumes more than 40% of monthly income',
      },
    ]);
    expect(result.completedAt).toBeInstanceOf(Date);
  });

  it('computes an approve recommendation for strong applicants', () => {
    const created = service.create(
      baseDto({
        applicantEmail: 'user2@example.com',
        monthlyIncome: 10000,
        monthlyRent: 2000,
      }),
    );

    const result = service.process(created.id);

    expect(result).toMatchObject({
      creditScore: 804,
      backgroundStatus: 'CLEAR',
      incomeVerified: true,
      overallScore: 96,
      recommendation: ScreeningRecommendation.APPROVE,
      riskFactors: [],
    });
  });

  it('computes a conditional recommendation when background review is required', () => {
    const created = service.create(
      baseDto({
        applicantEmail: 'user21@example.com',
        monthlyIncome: 10000,
        monthlyRent: 2000,
      }),
    );

    const result = service.process(created.id);

    expect(result).toMatchObject({
      creditScore: 628,
      backgroundStatus: 'CONSIDER',
      incomeVerified: true,
      overallScore: 65,
      recommendation: ScreeningRecommendation.CONDITIONAL,
    });
    expect(result.riskFactors).toEqual([
      {
        factor: 'background_check',
        severity: RiskSeverity.HIGH,
        description: 'Background check requires manual review',
      },
    ]);
  });

  it('treats zero rent as unverified income without a rent burden factor', () => {
    const created = service.create(
      baseDto({
        applicantEmail: 'user2@example.com',
        monthlyIncome: 5000,
        monthlyRent: 0,
      }),
    );

    const result = service.process(created.id);

    expect(result.incomeVerified).toBe(false);
    expect(result.overallScore).toBe(66);
    expect(result.riskFactors?.map((factor) => factor.factor)).toEqual(['income_verification']);
  });

  it('handles zero income without dividing rent by income', () => {
    const created = service.create(
      baseDto({
        applicantEmail: 'user2@example.com',
        monthlyIncome: 0,
        monthlyRent: 1000,
      }),
    );

    const result = service.process(created.id);

    expect(result.incomeVerified).toBe(false);
    expect(result.riskFactors?.map((factor) => factor.factor)).toEqual(['income_verification']);
  });

  it('redacts applicant data for privacy opt-out after processing', () => {
    const created = service.create(
      baseDto({
        applicantEmail: 'user2@example.com',
        monthlyIncome: 10000,
        monthlyRent: 2000,
        optOut: true,
      }),
    );

    const result = service.process(created.id);

    expect(internals().get(result.id)).toMatchObject({
      applicantName: 'REDACTED',
      applicantEmail: 'redacted@example.invalid',
    });
    expect(result).not.toHaveProperty('applicantName');
    expect(result).not.toHaveProperty('applicantEmail');
  });

  it('returns the cached completed result on repeated processing', () => {
    const created = service.create(
      baseDto({
        applicantEmail: 'user2@example.com',
        monthlyIncome: 10000,
        monthlyRent: 2000,
      }),
    );

    const first = service.process(created.id);
    const completedAt = internals().get(first.id)?.completedAt;
    const second = service.process(created.id);

    expect(second).toEqual(first);
    expect(internals().get(first.id)?.completedAt).toBe(completedAt);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('throws when processing an unknown screening', () => {
    expect(() => service.process('missing')).toThrow(NotFoundException);
  });
});
