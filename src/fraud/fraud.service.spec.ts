import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FraudService } from './fraud.service';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../email/email.service';
import { SmsService } from '../notifications/sms.service';
import { GeoLocationService } from './geo-location.service';
import { DeviceFingerprintService } from './device-fingerprint.service';
import { FraudPattern, FraudSeverity } from '../types/prisma.types';

// FraudService's AlertPayload type and private detection helpers aren't exported;
// this describes just enough shape to call them from tests without `any`.
interface FraudServiceInternals {
  createOrUpdateAlert(payload: Record<string, unknown>): Promise<{ id: string } | null>;
  findOpenAlert(payload: Record<string, unknown>): Promise<unknown>;
  notifySecurityTeam(alert: unknown, isUpdate?: boolean): Promise<void>;
  blockUserForFraud(
    userId: string,
    alertId: string,
    actorId: string,
    reason: string,
  ): Promise<void>;
}

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
  };

  const mockEmailService = {
    sendFraudAlertEmail: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'FRAUD_ALERT_RECIPIENTS') {
        return 'fraud@propchain.test';
      }

      return undefined;
    }),
  };

  const mockGeoLocationService = {
    extractIp: jest.fn().mockReturnValue('203.0.113.42'),
    lookup: jest.fn().mockReturnValue({
      ipAddress: '203.0.113.42',
      countryCode: 'US',
      city: 'Mountain View',
      source: 'lookup',
    }),
    resolveFromRequest: jest.fn().mockReturnValue({
      ipAddress: '203.0.113.42',
      countryCode: 'US',
      city: 'Mountain View',
      source: 'header',
    }),
  } as any;

  const mockDeviceFingerprintService = {
    compute: jest.fn().mockReturnValue({
      fingerprint: 'fp-test-stable-hash',
      derived: { browserFamily: 'Chrome', osFamily: 'Linux', isMobile: false, isBot: false },
    }),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FraudService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: SmsService, useValue: { sendSms: jest.fn().mockResolvedValue(true) } },
        { provide: GeoLocationService, useValue: mockGeoLocationService },
        { provide: DeviceFingerprintService, useValue: mockDeviceFingerprintService },
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
      .spyOn(service as unknown as FraudServiceInternals, 'createOrUpdateAlert')
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
      .spyOn(service as unknown as FraudServiceInternals, 'createOrUpdateAlert')
      .mockImplementation(async (payload: Record<string, unknown>) => payload as { id: string });

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
    jest.spyOn(service as unknown as FraudServiceInternals, 'findOpenAlert').mockResolvedValue(null);
    jest.spyOn(service as unknown as FraudServiceInternals, 'notifySecurityTeam').mockResolvedValue(undefined);
    const blockUserForFraudSpy = jest
      .spyOn(service as unknown as FraudServiceInternals, 'blockUserForFraud')
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

    await (service as unknown as FraudServiceInternals).createOrUpdateAlert({
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
