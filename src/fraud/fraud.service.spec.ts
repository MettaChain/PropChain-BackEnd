import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FraudService } from './fraud.service';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../email/email.service';
import { FraudPattern, FraudSeverity } from '../types/prisma.types';

describe('FraudService', () => {
  let service: FraudService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    loginAttempt: {
      count: jest.fn(),
    },
    loginHistory: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    property: {
      findUnique: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    fraudAlert: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    fraudInvestigationNote: {
      create: jest.fn(),
    },
    activityLog: {
      create: jest.fn(),
    },
    session: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  } as any;

  const mockEmailService = {
    sendFraudAlertEmail: jest.fn(),
  } as any;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'FRAUD_ALERT_RECIPIENTS') {
        return 'fraud@propchain.test';
      }

      return undefined;
    }),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FraudService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<FraudService>(FraudService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates a failed-login alert once the threshold is crossed', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });
    mockPrismaService.loginAttempt.count.mockResolvedValue(6);

    const createOrUpdateAlertSpy = jest
      .spyOn(service as any, 'createOrUpdateAlert')
      .mockResolvedValue({ id: 'alert-1' });

    const result = await service.evaluateFailedLogin('user@example.com', '10.0.0.1', 'Mozilla');

    expect(result).toEqual({ id: 'alert-1' });
    expect(createOrUpdateAlertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        pattern: FraudPattern.EXCESSIVE_FAILED_LOGINS,
        severity: FraudSeverity.MEDIUM,
      }),
    );
  });

  it('flags suspicious property patterns for rapid duplicate high-value listings', async () => {
    mockPrismaService.property.findUnique.mockResolvedValue({
      id: 'property-1',
      ownerId: 'owner-1',
      address: '1 Main St',
      city: 'Austin',
      state: 'TX',
      zipCode: '78701',
      country: 'USA',
      price: 1500000,
      owner: {
        id: 'owner-1',
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
    });
    mockPrismaService.property.count.mockResolvedValue(3);
    mockPrismaService.property.findMany.mockResolvedValue([
      {
        id: 'property-2',
        ownerId: 'owner-2',
        title: 'Duplicate listing',
        createdAt: new Date(),
      },
    ]);

    const createOrUpdateAlertSpy = jest
      .spyOn(service as any, 'createOrUpdateAlert')
      .mockImplementation(async (payload: any) => payload);

    const alerts = await service.evaluatePropertyCreated('property-1');

    expect(alerts).toHaveLength(3);
    expect(createOrUpdateAlertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyId: 'property-1',
        pattern: FraudPattern.RAPID_PROPERTY_LISTINGS,
      }),
    );
    expect(createOrUpdateAlertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyId: 'property-1',
        pattern: FraudPattern.DUPLICATE_PROPERTY_ADDRESS,
      }),
    );
    expect(createOrUpdateAlertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyId: 'property-1',
        pattern: FraudPattern.HIGH_VALUE_NEW_ACCOUNT_LISTING,
      }),
    );
  });

  it('auto-blocks a user when a critical alert is created with enforcement enabled', async () => {
    jest.spyOn(service as any, 'findOpenAlert').mockResolvedValue(null);
    jest.spyOn(service as any, 'notifySecurityTeam').mockResolvedValue(undefined);
    const blockUserForFraudSpy = jest
      .spyOn(service as any, 'blockUserForFraud')
      .mockResolvedValue(undefined);

    mockPrismaService.fraudAlert.create.mockResolvedValue({
      id: 'alert-1',
      pattern: FraudPattern.TOKEN_REUSE,
      severity: FraudSeverity.CRITICAL,
      title: 'Refresh token reuse detected',
      description: 'Detected token reuse',
      user: {
        id: 'user-1',
        email: 'user@example.com',
      },
    });

    await (service as any).createOrUpdateAlert({
      userId: 'user-1',
      pattern: FraudPattern.TOKEN_REUSE,
      severity: FraudSeverity.CRITICAL,
      score: 100,
      title: 'Refresh token reuse detected',
      description: 'Detected token reuse',
      evidence: {
        reusedJti: 'token-1',
      },
      autoBlockUser: true,
    });

    expect(mockPrismaService.fraudAlert.create).toHaveBeenCalled();
    expect(blockUserForFraudSpy).toHaveBeenCalledWith(
      'user-1',
      'alert-1',
      'user-1',
      'Automatically blocked by the fraud detection engine.',
    );
  });
});
