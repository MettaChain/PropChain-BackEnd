import { Test, TestingModule } from '@nestjs/testing';
import {
  FraudAlertStatus,
  FraudEntityType,
  FraudSeverity,
  PropertyStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../email/email.service';
import { FraudService } from './fraud.service';

describe('FraudService', () => {
  let service: FraudService;

  const mockPrismaService = {
    $transaction: jest.fn(),
    loginAttempt: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    loginHistory: {
      findMany: jest.fn(),
    },
    session: {
      count: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    property: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    fraudAlert: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    fraudSignal: {
      create: jest.fn(),
    },
    fraudInvestigationNote: {
      create: jest.fn(),
    },
    activityLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  } as any;

  const mockEmailService = {
    sendFraudAlertEmail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FraudService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
      ],
    }).compile();

    service = module.get<FraudService>(FraudService);
    mockPrismaService.$transaction.mockImplementation(async (callback: any) =>
      callback(mockPrismaService),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('auto-blocks a user when credential stuffing is detected', async () => {
    mockPrismaService.loginAttempt.count.mockResolvedValue(10);
    mockPrismaService.loginAttempt.findMany.mockResolvedValue([
      { ipAddress: '1.1.1.1' },
      { ipAddress: '2.2.2.2' },
      { ipAddress: '3.3.3.3' },
    ]);
    mockPrismaService.fraudAlert.findFirst.mockResolvedValue(null);
    mockPrismaService.fraudAlert.create.mockResolvedValue({
      id: 'alert-1',
      userId: 'user-1',
      title: 'Potential credential stuffing detected',
      description: 'Detected 10 failed login attempts.',
      severity: FraudSeverity.CRITICAL,
      entityType: FraudEntityType.ACCOUNT,
      entityId: 'user-1',
      status: FraudAlertStatus.BLOCKED,
      autoBlocked: true,
      riskScore: 92,
    });

    const result = await service.analyzeFailedLogin({
      email: 'user@example.com',
      userId: 'user-1',
      ipAddress: '4.4.4.4',
      userAgent: 'jest',
    });

    expect(result).toMatchObject({
      id: 'alert-1',
      status: FraudAlertStatus.BLOCKED,
      autoBlocked: true,
      severity: FraudSeverity.CRITICAL,
    });
    expect(mockPrismaService.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { isBlocked: true },
    });
    expect(mockPrismaService.session.updateMany).toHaveBeenCalled();
    expect(mockEmailService.sendFraudAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        alertId: 'alert-1',
        severity: FraudSeverity.CRITICAL,
        autoBlocked: true,
      }),
    );
  });

  it('detects high-risk login anomalies from IP rotation and session burst', async () => {
    mockPrismaService.loginHistory.findMany.mockResolvedValue([
      { ipAddress: '1.1.1.1' },
      { ipAddress: '2.2.2.2' },
      { ipAddress: '3.3.3.3' },
      { ipAddress: '4.4.4.4' },
      { ipAddress: '5.5.5.5' },
    ]);
    mockPrismaService.session.count.mockResolvedValueOnce(7).mockResolvedValueOnce(6);
    mockPrismaService.fraudAlert.findFirst.mockResolvedValue(null);
    mockPrismaService.fraudAlert.create
      .mockResolvedValueOnce({
        id: 'alert-ip',
        userId: 'user-1',
        title: 'Rapid IP rotation detected',
        description: 'IP rotation detected.',
        severity: FraudSeverity.HIGH,
        entityType: FraudEntityType.SESSION,
        entityId: 'user-1',
        status: FraudAlertStatus.OPEN,
        autoBlocked: false,
        riskScore: 78,
      })
      .mockResolvedValueOnce({
        id: 'alert-session',
        userId: 'user-1',
        title: 'Unusual session burst detected',
        description: 'Session burst detected.',
        severity: FraudSeverity.HIGH,
        entityType: FraudEntityType.SESSION,
        entityId: 'user-1',
        status: FraudAlertStatus.OPEN,
        autoBlocked: false,
        riskScore: 70,
      });

    const result = await service.analyzeSuccessfulLogin({
      userId: 'user-1',
      email: 'user@example.com',
      ipAddress: '6.6.6.6',
      userAgent: 'jest',
    });

    expect(result).toHaveLength(2);
    expect(mockPrismaService.fraudAlert.create).toHaveBeenCalledTimes(2);
    expect(mockEmailService.sendFraudAlertEmail).toHaveBeenCalledTimes(2);
  });

  it('places an active duplicate property listing on hold', async () => {
    mockPrismaService.property.findUnique
      .mockResolvedValueOnce({
        id: 'property-1',
        ownerId: 'user-1',
        address: '10 Broad Street',
        city: 'Austin',
        state: 'TX',
        zipCode: '78701',
        price: { toString: () => '1500000' },
        status: PropertyStatus.ACTIVE,
        owner: {
          id: 'user-1',
          email: 'owner@example.com',
          role: UserRole.USER,
          isVerified: false,
          trustScore: 15,
          createdAt: new Date(),
        },
      })
      .mockResolvedValueOnce({
        id: 'property-1',
        status: PropertyStatus.ACTIVE,
      });
    mockPrismaService.property.findMany
      .mockResolvedValueOnce([
        {
          id: 'property-2',
          ownerId: 'user-2',
          address: '10 Broad Street',
          city: 'Austin',
          state: 'TX',
          zipCode: '78701',
          price: { toString: () => '1200000' },
          status: PropertyStatus.ACTIVE,
        },
        {
          id: 'property-3',
          ownerId: 'user-3',
          address: '11 Broad Street',
          city: 'Austin',
          state: 'TX',
          zipCode: '78701',
          price: { toString: () => '1300000' },
          status: PropertyStatus.ACTIVE,
        },
        {
          id: 'property-4',
          ownerId: 'user-4',
          address: '12 Broad Street',
          city: 'Austin',
          state: 'TX',
          zipCode: '78701',
          price: { toString: () => '1250000' },
          status: PropertyStatus.ACTIVE,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'property-2',
          ownerId: 'user-2',
          address: '10 Broad Street',
          city: 'Austin',
          state: 'TX',
          zipCode: '78701',
          price: { toString: () => '1200000' },
          status: PropertyStatus.ACTIVE,
        },
      ]);
    mockPrismaService.fraudAlert.findFirst.mockResolvedValue(null);
    mockPrismaService.fraudAlert.create
      .mockResolvedValueOnce({
        id: 'alert-duplicate',
        userId: 'user-1',
        title: 'Duplicate property listing detected',
        description: 'Duplicate property listing detected.',
        severity: FraudSeverity.HIGH,
        entityType: FraudEntityType.PROPERTY,
        entityId: 'property-1',
        status: FraudAlertStatus.OPEN,
        autoBlocked: false,
        riskScore: 85,
      })
      .mockResolvedValueOnce({
        id: 'alert-high-value',
        userId: 'user-1',
        title: 'High-value listing from low-trust account detected',
        description: 'High-value listing from low-trust account detected.',
        severity: FraudSeverity.HIGH,
        entityType: FraudEntityType.PROPERTY,
        entityId: 'property-1',
        status: FraudAlertStatus.OPEN,
        autoBlocked: false,
        riskScore: 82,
      });

    const result = await service.analyzePropertyListing('property-1', UserRole.USER);

    expect(result.holdApplied).toBe(true);
    expect(result.alerts).toHaveLength(2);
    expect(mockPrismaService.property.update).toHaveBeenCalledWith({
      where: { id: 'property-1' },
      data: { status: PropertyStatus.PENDING },
    });
  });
});
