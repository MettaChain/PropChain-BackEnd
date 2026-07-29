// @ts-nocheck

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../email/email.service';
import { SmsService } from '../notifications/sms.service';
import { GeoLocationService } from './geo-location.service';
import { DeviceFingerprintService } from './device-fingerprint.service';
import {
  AddFraudInvestigationNoteDto,
  BlockFraudUserDto,
  FraudAlertsQueryDto,
  ReviewFraudAlertDto,
} from './dto/fraud.dto';
import { FraudPattern, FraudSeverity, FraudStatus } from '../types/prisma.types';

type DetectionSubject = {
  userId?: string;
  propertyId?: string;
  transactionId?: string;
  sessionId?: string;
};

type AlertPayload = DetectionSubject & {
  pattern: FraudPattern;
  severity: FraudSeverity;
  score: number;
  title: string;
  description: string;
  evidence?: Prisma.InputJsonValue;
  autoBlockUser?: boolean;
};

type InvestigationContext = {
  recentSessions: unknown[];
  recentLogins: unknown[];
  recentActivity: unknown[];
  relatedAlerts: unknown[];
  duplicateProperties: unknown[];
  sharedIpAccounts: unknown[];
};

@Injectable()
export class FraudService {
  private readonly logger = new Logger(FraudService.name);
  private readonly fraudAlertRecipients: string[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
    private readonly configService: ConfigService,
    private readonly geoLocationService: GeoLocationService,
    private readonly deviceFingerprintService: DeviceFingerprintService,
  ) {
    this.fraudAlertRecipients = (this.configService.get<string>('FRAUD_ALERT_RECIPIENTS') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  async evaluateFailedLogin(email: string, ipAddress?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return null;
    }

    const windowStart = new Date(Date.now() - 30 * 60 * 1000);
    const failedAttempts = await this.prisma.loginAttempt.count({
      where: {
        email,
        success: false,
        attemptTime: { gte: windowStart },
      },
    });

    if (failedAttempts < 5) {
      return null;
    }

    const severity = failedAttempts >= 10 ? FraudSeverity.HIGH : FraudSeverity.MEDIUM;

    return this.createOrUpdateAlert({
      userId: user.id,
      pattern: FraudPattern.EXCESSIVE_FAILED_LOGINS,
      severity,
      score: failedAttempts >= 10 ? 82 : 58,
      title: 'Repeated failed login attempts detected',
      description: `The account recorded ${failedAttempts} failed login attempts in the last 30 minutes.`,
      evidence: {
        email,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        failedAttempts,
        windowMinutes: 30,
      },
    });
  }

  async evaluateSuccessfulLogin(userId: string, ipAddress?: string, userAgent?: string) {
    const generatedAlerts: unknown[] = [];
    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [recentLogins, matchingLoginCount, sharedIpAccounts] = await Promise.all([
      this.prisma.loginHistory.findMany({
        where: { userId, timestamp: { gte: windowStart } },
        orderBy: { timestamp: 'desc' },
        take: 20,
      }),
      ipAddress || userAgent
        ? this.prisma.loginHistory.count({
            where: {
              userId,
              ...(ipAddress ? { ipAddress } : {}),
              ...(userAgent ? { userAgent } : {}),
            },
          })
        : Promise.resolve(0),
      ipAddress
        ? this.prisma.loginHistory.findMany({
            where: {
              ipAddress,
              timestamp: { gte: windowStart },
            },
            select: { userId: true },
            distinct: ['userId'],
          })
        : Promise.resolve([]),
    ]);

    const distinctIps = new Set(
      recentLogins
        .map((entry) => entry.ipAddress)
        .filter((value): value is string => Boolean(value)),
    ).size;

    if (distinctIps >= 4) {
      generatedAlerts.push(
        await this.createOrUpdateAlert({
          userId,
          pattern: FraudPattern.MULTIPLE_IPS_FOR_ACCOUNT,
          severity: distinctIps >= 6 ? FraudSeverity.HIGH : FraudSeverity.MEDIUM,
          score: distinctIps >= 6 ? 84 : 60,
          title: 'Account accessed from multiple IP addresses',
          description: `The account used ${distinctIps} distinct IP addresses in the last 24 hours.`,
          evidence: {
            ipAddress: ipAddress ?? null,
            userAgent: userAgent ?? null,
            distinctIps,
            windowHours: 24,
            recentIps: Array.from(
              new Set(
                recentLogins
                  .map((entry) => entry.ipAddress)
                  .filter((value): value is string => Boolean(value)),
              ),
            ).slice(0, 10),
          },
        }),
      );
    }

    if (recentLogins.length > 1 && matchingLoginCount === 1 && (ipAddress || userAgent)) {
      generatedAlerts.push(
        await this.createOrUpdateAlert({
          userId,
          pattern: FraudPattern.NEW_DEVICE_LOGIN,
          severity: FraudSeverity.LOW,
          score: 24,
          title: 'Login from a new device or location',
          description:
            'A successful login came from a device or IP address not previously seen for this account.',
          evidence: {
            ipAddress: ipAddress ?? null,
            userAgent: userAgent ?? null,
            recentLoginCount: recentLogins.length,
          },
        }),
      );
    }

    if (ipAddress && sharedIpAccounts.length >= 3) {
      generatedAlerts.push(
        await this.createOrUpdateAlert({
          userId,
          pattern: FraudPattern.SHARED_IP_MULTIPLE_ACCOUNTS,
          severity: sharedIpAccounts.length >= 5 ? FraudSeverity.CRITICAL : FraudSeverity.HIGH,
          score: sharedIpAccounts.length >= 5 ? 95 : 78,
          title: 'Same IP address used across multiple accounts',
          description: `The login IP ${ipAddress} was used by ${sharedIpAccounts.length} accounts in the last 24 hours.`,
          evidence: {
            ipAddress,
            userAgent: userAgent ?? null,
            accountIds: sharedIpAccounts.map((entry) => entry.userId),
            distinctAccounts: sharedIpAccounts.length,
            windowHours: 24,
          },
          autoBlockUser: sharedIpAccounts.length >= 5,
        }),
      );
    }

    return generatedAlerts.filter(Boolean);
  }

  async handleTokenReuse(
    userId: string,
    reusedJti: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const session = await this.prisma.session.findFirst({
      where: {
        OR: [{ refreshTokenJti: reusedJti }, { accessTokenJti: reusedJti }],
      },
      orderBy: { createdAt: 'desc' },
    });

    return this.createOrUpdateAlert({
      userId,
      sessionId: session?.id,
      pattern: FraudPattern.TOKEN_REUSE,
      severity: FraudSeverity.CRITICAL,
      score: 100,
      title: 'Refresh token reuse detected',
      description:
        'A previously blacklisted token was presented again, which indicates possible token theft or replay.',
      evidence: {
        reusedJti,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        sessionId: session?.id ?? null,
      },
      autoBlockUser: true,
    });
  }

  async evaluatePropertyCreated(propertyId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        owner: true,
      },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const generatedAlerts: unknown[] = [];
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const normalizedAddress = this.normalizeAddress(
      `${property.address} ${property.city} ${property.state} ${property.zipCode} ${property.country}`,
    );

    const [rapidListingsCount, duplicateListings] = await Promise.all([
      this.prisma.property.count({
        where: {
          ownerId: property.ownerId,
          createdAt: { gte: oneHourAgo },
        },
      }),
      this.prisma.property.findMany({
        where: {
          id: { not: property.id },
          address: { equals: property.address, mode: 'insensitive' },
          city: { equals: property.city, mode: 'insensitive' },
          state: { equals: property.state, mode: 'insensitive' },
          zipCode: property.zipCode,
        },
        select: {
          id: true,
          ownerId: true,
          title: true,
          createdAt: true,
        },
        take: 10,
      }),
    ]);

    if (rapidListingsCount >= 3) {
      generatedAlerts.push(
        await this.createOrUpdateAlert({
          userId: property.ownerId,
          propertyId: property.id,
          pattern: FraudPattern.RAPID_PROPERTY_LISTINGS,
          severity: rapidListingsCount >= 5 ? FraudSeverity.HIGH : FraudSeverity.MEDIUM,
          score: rapidListingsCount >= 5 ? 80 : 55,
          title: 'Rapid listing creation detected',
          description: `The owner created ${rapidListingsCount} property listings within the last hour.`,
          evidence: {
            propertyId: property.id,
            ownerId: property.ownerId,
            rapidListingsCount,
            windowMinutes: 60,
          },
        }),
      );
    }

    const duplicatesByOtherOwners = duplicateListings.filter(
      (listing) => listing.ownerId !== property.ownerId,
    );

    if (duplicatesByOtherOwners.length > 0) {
      generatedAlerts.push(
        await this.createOrUpdateAlert({
          userId: property.ownerId,
          propertyId: property.id,
          pattern: FraudPattern.DUPLICATE_PROPERTY_ADDRESS,
          severity: duplicatesByOtherOwners.length >= 2 ? FraudSeverity.HIGH : FraudSeverity.MEDIUM,
          score: duplicatesByOtherOwners.length >= 2 ? 76 : 57,
          title: 'Duplicate property address detected',
          description: 'The same property address appears on listings owned by different accounts.',
          evidence: {
            normalizedAddress,
            duplicateListings: duplicatesByOtherOwners,
          },
        }),
      );
    }

    const accountAgeDays = Math.floor(
      (Date.now() - new Date(property.owner.createdAt).getTime()) / (1000 * 60 * 60 * 24),
    );
    const propertyPrice = Number(property.price);

    if (accountAgeDays <= 14 && propertyPrice >= 1_000_000) {
      generatedAlerts.push(
        await this.createOrUpdateAlert({
          userId: property.ownerId,
          propertyId: property.id,
          pattern: FraudPattern.HIGH_VALUE_NEW_ACCOUNT_LISTING,
          severity: FraudSeverity.HIGH,
          score: 85,
          title: 'High-value listing from a new account',
          description: 'A recently created account submitted a high-value property listing.',
          evidence: {
            propertyId: property.id,
            ownerId: property.ownerId,
            accountAgeDays,
            price: propertyPrice,
            thresholdPrice: 1000000,
            thresholdAgeDays: 14,
          },
        }),
      );
    }

    return generatedAlerts.filter(Boolean);
  }

  async listAlerts(query: FraudAlertsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.FraudAlertWhereInput = {
      status: query.status,
      severity: query.severity,
      pattern: query.pattern,
      userId: query.userId,
      assignedToId: query.assignedToId,
      autoBlocked: query.autoBlocked,
    };

    const [items, total] = await Promise.all([
      this.prisma.fraudAlert.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ severity: 'desc' }, { lastDetectedAt: 'desc' }],
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              isBlocked: true,
            },
          },
          property: {
            select: {
              id: true,
              title: true,
              address: true,
              city: true,
              state: true,
            },
          },
          assignedTo: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.fraudAlert.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAlertSummary() {
    const [open, investigating, resolved, dismissed, autoBlocked, critical, high] =
      await Promise.all([
        this.prisma.fraudAlert.count({ where: { status: FraudStatus.OPEN } }),
        this.prisma.fraudAlert.count({ where: { status: FraudStatus.INVESTIGATING } }),
        this.prisma.fraudAlert.count({ where: { status: FraudStatus.RESOLVED } }),
        this.prisma.fraudAlert.count({ where: { status: FraudStatus.DISMISSED } }),
        this.prisma.fraudAlert.count({ where: { autoBlocked: true } }),
        this.prisma.fraudAlert.count({ where: { severity: FraudSeverity.CRITICAL } }),
        this.prisma.fraudAlert.count({ where: { severity: FraudSeverity.HIGH } }),
      ]);

    const byPattern = await this.prisma.fraudAlert.groupBy({
      by: ['pattern'],
      _count: { _all: true },
      orderBy: {
        _count: {
          pattern: 'desc',
        },
      },
    });

    return {
      statuses: { open, investigating, resolved, dismissed },
      severity: { critical, high },
      autoBlocked,
      byPattern: byPattern.map((entry) => ({
        pattern: entry.pattern,
        count: entry._count._all,
      })),
    };
  }

  async getAlertDetails(alertId: string) {
    const alert = await this.prisma.fraudAlert.findUnique({
      where: { id: alertId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            isBlocked: true,
            createdAt: true,
            trustScore: true,
          },
        },
        property: {
          select: {
            id: true,
            title: true,
            address: true,
            city: true,
            state: true,
            zipCode: true,
            price: true,
            status: true,
            ownerId: true,
          },
        },
        transaction: true,
        session: {
          select: {
            id: true,
            ipAddress: true,
            userAgent: true,
            createdAt: true,
            lastActivityAt: true,
            isRevoked: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        resolvedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
          include: {
            actor: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!alert) {
      throw new NotFoundException('Fraud alert not found');
    }

    const investigationContext = await this.buildInvestigationContext(alert);
    return {
      ...alert,
      investigationContext,
    };
  }

  async reviewAlert(alertId: string, payload: ReviewFraudAlertDto, actorId: string) {
    const alert = await this.ensureAlertExists(alertId);

    const nextStatus =
      payload.status ??
      (payload.note || payload.assignedToId ? FraudStatus.INVESTIGATING : alert.status);

    const updated = await this.prisma.fraudAlert.update({
      where: { id: alertId },
      data: {
        status: nextStatus,
        assignedToId: payload.assignedToId ?? alert.assignedToId,
        resolvedAt:
          nextStatus === FraudStatus.RESOLVED || nextStatus === FraudStatus.DISMISSED
            ? new Date()
            : null,
        resolvedById:
          nextStatus === FraudStatus.RESOLVED || nextStatus === FraudStatus.DISMISSED
            ? actorId
            : null,
      },
    });

    if (payload.note) {
      await this.addInvestigationNote(alertId, { note: payload.note, action: 'REVIEWED' }, actorId);
    }

    if (payload.blockUser && alert.userId) {
      await this.blockUserForFraud(alert.userId, alertId, actorId, 'Blocked during fraud review.');
    }

    return this.getAlertDetails(updated.id);
  }

  async addInvestigationNote(
    alertId: string,
    payload: AddFraudInvestigationNoteDto,
    actorId: string,
  ) {
    await this.ensureAlertExists(alertId);

    return this.prisma.fraudInvestigationNote.create({
      data: {
        alertId,
        actorId,
        action: payload.action,
        note: payload.note,
        metadata: payload.metadata as Prisma.InputJsonValue | undefined,
      },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async blockUserFromAlert(alertId: string, actorId: string, payload?: BlockFraudUserDto) {
    const alert = await this.ensureAlertExists(alertId);
    if (!alert.userId) {
      throw new NotFoundException('Fraud alert is not linked to a user');
    }

    await this.blockUserForFraud(
      alert.userId,
      alertId,
      actorId,
      payload?.reason ?? 'User blocked from fraud investigation workflow.',
    );

    return this.getAlertDetails(alertId);
  }

  async runUserScan(userId: string, actorId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [failedLoginAlert, loginAlerts] = await Promise.all([
      this.evaluateFailedLogin(user.email),
      this.evaluateSuccessfulLogin(user.id),
    ]);

    if (actorId) {
      await this.prisma.activityLog.create({
        data: {
          userId: actorId,
          action: 'FRAUD_USER_SCAN_TRIGGERED',
          entityType: 'USER',
          entityId: userId,
          description: `Manual fraud scan executed for user ${userId}.`,
        },
      });
    }

    return {
      userId,
      generatedAlerts: [failedLoginAlert, ...loginAlerts].filter(Boolean),
    };
  }

  async runPropertyScan(propertyId: string, actorId?: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const generatedAlerts = await this.evaluatePropertyCreated(propertyId);

    if (actorId) {
      await this.prisma.activityLog.create({
        data: {
          userId: actorId,
          action: 'FRAUD_PROPERTY_SCAN_TRIGGERED',
          entityType: 'PROPERTY',
          entityId: propertyId,
          description: `Manual fraud scan executed for property ${propertyId}.`,
        },
      });
    }

    return {
      propertyId,
      generatedAlerts,
    };
  }

  private async createOrUpdateAlert(payload: AlertPayload) {
    const existingAlert = await this.findOpenAlert(payload);
    const now = new Date();

    if (existingAlert) {
      const severityIncreased =
        this.severityRank(payload.severity) > this.severityRank(existingAlert.severity);
      const updated = await this.prisma.fraudAlert.update({
        where: { id: existingAlert.id },
        data: {
          severity: severityIncreased ? payload.severity : existingAlert.severity,
          score: Math.max(existingAlert.score, payload.score),
          title: payload.title,
          description: payload.description,
          evidence: payload.evidence,
          lastDetectedAt: now,
          occurrenceCount: {
            increment: 1,
          },
          autoBlocked: existingAlert.autoBlocked || Boolean(payload.autoBlockUser),
        },
      });

      if (severityIncreased || updated.occurrenceCount % 5 === 0) {
        await this.deliverMultiChannelNotifications(updated, payload);
      }

      if (
        payload.autoBlockUser &&
        payload.userId &&
        !existingAlert.autoBlocked &&
        !existingAlert.userId?.startsWith('system-')
      ) {
        await this.blockUserForFraud(
          payload.userId,
          updated.id,
          payload.userId,
          'Automatically blocked after repeated fraud detections.',
        );
      }

      return updated;
    }

    const created = await this.prisma.fraudAlert.create({
      data: {
        userId: payload.userId,
        propertyId: payload.propertyId,
        transactionId: payload.transactionId,
        sessionId: payload.sessionId,
        pattern: payload.pattern,
        severity: payload.severity,
        score: payload.score,
        title: payload.title,
        description: payload.description,
        evidence: payload.evidence,
        autoBlocked: Boolean(payload.autoBlockUser),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            isBlocked: true,
          },
        },
      },
    });

    if (payload.userId) {
      await this.prisma.activityLog.create({
        data: {
          userId: payload.userId,
          action: 'FRAUD_ALERT_CREATED',
          entityType: payload.propertyId
            ? 'PROPERTY'
            : payload.transactionId
              ? 'TRANSACTION'
              : 'USER',
          entityId: payload.propertyId ?? payload.transactionId ?? payload.userId,
          description: payload.description,
          metadata: payload.evidence,
        },
      });
    }

    await this.deliverMultiChannelNotifications(created, payload);

    if (payload.autoBlockUser && payload.userId) {
      await this.blockUserForFraud(
        payload.userId,
        created.id,
        payload.userId,
        'Automatically blocked by the fraud detection engine.',
      );
    }

    return created;
  }

  /**
   * Multi-channel notification delivery based on alert severity:
   *  - ALL severities: in-app + email to security team
   *  - HIGH + CRITICAL: email to user
   *  - CRITICAL: SMS to user (if available)
   */
  private async deliverMultiChannelNotifications(alert: any, payload: AlertPayload) {
    try {
      await this.notifySecurityTeam(alert, false);
    } catch (error) {
      this.logger.error(`Failed to send security team notification: ${error.message}`);
    }

    if (
      (payload.severity === FraudSeverity.HIGH || payload.severity === FraudSeverity.CRITICAL) &&
      alert.user?.email
    ) {
      try {
        await this.emailService.sendEmail({
          to: alert.user.email,
          subject: `[Security Alert][${payload.severity}] ${payload.title}`,
          html: `
            <h2>Fraud Alert - ${payload.severity}</h2>
            <p>${payload.description}</p>
            <p>If you did not perform this action, please secure your account immediately and contact support.</p>
          `,
          userId: payload.userId,
          emailType: 'FRAUD_ALERT',
        });
      } catch (error) {
        this.logger.error(`Failed to send fraud alert email to user: ${error.message}`);
      }
    }

    if (payload.severity === FraudSeverity.CRITICAL && alert.user?.email) {
      try {
        const phone = await this.getUserPhone(payload.userId);
        if (phone) {
          await this.smsService.sendSms(
            phone,
            `[CRITICAL Security Alert] ${payload.title}. ${payload.description} Please secure your account immediately.`,
          );
        } else {
          this.logger.warn(`No phone number for user ${payload.userId}, skipping SMS notification`);
        }
      } catch (error) {
        this.logger.error(`Failed to send fraud alert SMS: ${error.message}`);
      }
    }

    if (payload.userId) {
      try {
        await this.prisma.notification.create({
          data: {
            userId: payload.userId,
            title: `Security Alert: ${payload.title}`,
            message: payload.description,
            type: 'FRAUD_ALERT',
            status: 'PENDING',
            metadata: {
              severity: payload.severity,
              pattern: payload.pattern,
              score: payload.score,
              alertId: alert.id,
            },
          },
        });
      } catch (error) {
        this.logger.error(`Failed to create in-app notification: ${error.message}`);
      }
    }
  }

  private async getUserPhone(userId?: string): Promise<string | null> {
    if (!userId) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    return user?.phone ?? null;
  }

  private async findOpenAlert(payload: AlertPayload) {
    return this.prisma.fraudAlert.findFirst({
      where: {
        pattern: payload.pattern,
        userId: payload.userId,
        propertyId: payload.propertyId,
        transactionId: payload.transactionId,
        sessionId: payload.sessionId,
        status: {
          in: [FraudStatus.OPEN, FraudStatus.INVESTIGATING],
        },
      },
      orderBy: { lastDetectedAt: 'desc' },
    });
  }

  private async ensureAlertExists(alertId: string) {
    const alert = await this.prisma.fraudAlert.findUnique({ where: { id: alertId } });
    if (!alert) {
      throw new NotFoundException('Fraud alert not found');
    }
    return alert;
  }

  private async buildInvestigationContext(alert: any): Promise<InvestigationContext> {
    const userId = alert.userId;
    const ipAddress = alert.session?.ipAddress ?? alert.evidence?.ipAddress;

    if (!userId) {
      return {
        recentSessions: [],
        recentLogins: [],
        recentActivity: [],
        relatedAlerts: [],
        duplicateProperties: [],
        sharedIpAccounts: [],
      };
    }

    const [recentSessions, recentLogins, recentActivity, relatedAlerts, duplicateProperties] =
      await Promise.all([
        this.prisma.session.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.loginHistory.findMany({
          where: { userId },
          orderBy: { timestamp: 'desc' },
          take: 10,
        }),
        this.prisma.activityLog.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 15,
        }),
        this.prisma.fraudAlert.findMany({
          where: {
            userId,
            id: { not: alert.id },
          },
          orderBy: { lastDetectedAt: 'desc' },
          take: 10,
        }),
        alert.propertyId
          ? this.prisma.property.findMany({
              where: {
                id: { not: alert.propertyId },
                address: { equals: alert.property?.address, mode: 'insensitive' },
                city: { equals: alert.property?.city, mode: 'insensitive' },
                state: { equals: alert.property?.state, mode: 'insensitive' },
                zipCode: alert.property?.zipCode,
              },
              select: {
                id: true,
                ownerId: true,
                title: true,
                createdAt: true,
              },
            })
          : Promise.resolve([]),
      ]);

    const sharedIpAccounts =
      typeof ipAddress === 'string' && ipAddress.length > 0
        ? await this.prisma.loginHistory.findMany({
            where: { ipAddress },
            orderBy: { timestamp: 'desc' },
            take: 20,
            distinct: ['userId'],
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  isBlocked: true,
                },
              },
            },
          })
        : [];

    return {
      recentSessions,
      recentLogins,
      recentActivity,
      relatedAlerts,
      duplicateProperties,
      sharedIpAccounts,
    };
  }

  private async blockUserForFraud(
    userId: string,
    alertId: string,
    actorId: string,
    reason: string,
  ) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isBlocked: true,
      },
    });

    await this.prisma.fraudAlert.update({
      where: { id: alertId },
      data: {
        autoBlocked: true,
      },
    });

    await this.prisma.activityLog.create({
      data: {
        userId,
        action: 'USER_BLOCKED_FOR_FRAUD',
        entityType: 'FRAUD_ALERT',
        entityId: alertId,
        description: reason,
        metadata: {
          actorId,
        },
      },
    });

    await this.prisma.fraudInvestigationNote.create({
      data: {
        alertId,
        actorId,
        action: 'USER_BLOCKED',
        note: reason,
        metadata: {
          userId,
        },
      },
    });
  }

  private async notifySecurityTeam(alert: any, isUpdate: boolean = false) {
    if (this.fraudAlertRecipients.length === 0) {
      return;
    }

    try {
      const title = isUpdate
        ? `[Fraud Alert Update][${alert.severity}] ${alert.title} (Occurrence #${alert.occurrenceCount})`
        : `[Fraud Alert][${alert.severity}] ${alert.title}`;

      await this.emailService.sendFraudAlertEmail(this.fraudAlertRecipients, {
        alertId: alert.id,
        pattern: alert.pattern,
        severity: alert.severity,
        title,
        description: isUpdate
          ? `${alert.description} This alert has been updated due to recurring activity.`
          : alert.description,
        userEmail: alert.user?.email,
      });
    } catch (error) {
      this.logger.error(`Failed to send fraud alert notification: ${error.message}`);
    }
  }

  /**
   * Public entry point invoked by the auth flow (#961). Captures the geo
   * location + device fingerprint, persists them on the latest Session row,
   * then runs every login-time fraud evaluation.
   */
  async recordLoginContext(
    userId: string,
    input: {
      ipAddress?: string;
      userAgent?: string;
      acceptLanguage?: string;
      geo?: import('./geo-location.service').GeoLocation | null;
      fingerprint?: string | null;
      accessTokenJti?: string;
      refreshTokenJti?: string;
    },
  ) {
    const geoLocation = input.geo ?? null;
    const fingerprint = input.fingerprint ?? null;

    // Persist on the most-recent session so we have a historical record.
    if (input.accessTokenJti) {
      try {
        await this.prisma.session.updateMany({
          where: { userId, accessTokenJti: input.accessTokenJti },
          data: {
            deviceFingerprint: fingerprint ?? undefined,
            geoCountryCode: geoLocation?.countryCode ?? undefined,
            geoCity: geoLocation?.city ?? undefined,
          },
        });
      } catch (error) {
        this.logger.warn(
          `Failed to attach geo/fingerprint to session: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const alerts: unknown[] = [];
    const [velocity, impossibleTravel, deviceMismatch] = await Promise.all([
      this.evaluateVelocity(userId, input.ipAddress),
      geoLocation?.countryCode
        ? this.evaluateImpossibleTravel(userId, geoLocation.countryCode)
        : Promise.resolve(null),
      fingerprint ? this.evaluateDeviceFingerprint(userId, fingerprint) : Promise.resolve(null),
    ]);

    if (velocity) alerts.push(velocity);
    if (impossibleTravel) alerts.push(impossibleTravel);
    if (deviceMismatch) alerts.push(deviceMismatch);

    if (alerts.length > 0 && input.accessTokenJti) {
      // Touch the session to bump lastActivityAt — useful for downstream UIs.
      try {
        await this.prisma.session.updateMany({
          where: { userId, accessTokenJti: input.accessTokenJti },
          data: { lastActivityAt: new Date() },
        });
      } catch {
        /* best-effort */
      }
    }

    return { alerts, geoLocation, fingerprint };
  }

  /**
   * Velocity check — fires when the same account performs > N successful
   * logins within M minutes.
   */
  async evaluateVelocity(userId: string, ipAddress?: string) {
    const windowMinutes = 5;
    const threshold = 10;
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

    const recentLogins = await this.prisma.loginHistory.count({
      where: {
        userId,
        timestamp: { gte: windowStart },
        ...(ipAddress ? { ipAddress } : {}),
      },
    });

    if (recentLogins < threshold) {
      return null;
    }

    return this.createOrUpdateAlert({
      userId,
      pattern: FraudPattern.VELOCITY_EXCEEDED,
      severity: recentLogins >= 25 ? FraudSeverity.HIGH : FraudSeverity.MEDIUM,
      score: recentLogins >= 25 ? 80 : 62,
      title: 'High login velocity detected',
      description: `${recentLogins} successful logins in the last ${windowMinutes} minutes exceed the established threshold.`,
      evidence: {
        recentLogins,
        windowMinutes,
        threshold,
        ipAddress: ipAddress ?? null,
      },
    });
  }

  /**
   * Impossible-travel alert — fires when login attempts come from 2+
   * distinct countries within the last hour.
   */
  async evaluateImpossibleTravel(userId: string, geoCountryCode: string) {
    if (!geoCountryCode) {
      return null;
    }
    const windowStart = new Date(Date.now() - 60 * 60 * 1000);
    const distinctCountries = await this.prisma.session.findMany({
      where: { userId, createdAt: { gte: windowStart } },
      select: { geoCountryCode: true },
      distinct: ['geoCountryCode'],
    });
    const codes = Array.from(
      new Set(
        distinctCountries
          .map((row) => row.geoCountryCode)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    if (!codes.includes(geoCountryCode)) {
      codes.push(geoCountryCode);
    }
    if (codes.length < 2) {
      return null;
    }

    return this.createOrUpdateAlert({
      userId,
      pattern: FraudPattern.IMPOSSIBLE_TRAVEL,
      severity: codes.length >= 3 ? FraudSeverity.HIGH : FraudSeverity.MEDIUM,
      score: codes.length >= 3 ? 76 : 60,
      title: 'Impossible travel detected',
      description: `Recent logins originated from ${codes.length} distinct countries (${codes.join(', ')}).`,
      evidence: {
        countries: codes,
        currentCountry: geoCountryCode,
        windowHours: 1,
      },
    });
  }

  /**
   * Device-fingerprint mismatch — stores the new fingerprint is associated
   * with no prior session, AND a previous fingerprint on the account
   * exists.
   */
  async evaluateDeviceFingerprint(userId: string, fingerprint: string) {
    if (!fingerprint) {
      return null;
    }
    const recent = await this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { deviceFingerprint: true, createdAt: true },
    });
    const priorFingerprints = recent
      .map((row) => row.deviceFingerprint)
      .filter((value): value is string => Boolean(value) && value !== fingerprint);
    if (priorFingerprints.length === 0) {
      return null;
    }

    return this.createOrUpdateAlert({
      userId,
      pattern: FraudPattern.DEVICE_FINGERPRINT_MISMATCH,
      severity: FraudSeverity.MEDIUM,
      score: 55,
      title: 'Login from new device fingerprint',
      description:
        'A session was opened from a device fingerprint that has previously not been seen on this account.',
      evidence: {
        previousFingerprintCount: priorFingerprints.length,
        sampleWindow: 5,
      },
    });
  }

  private severityRank(severity: FraudSeverity | string) {
    switch (severity) {
      case FraudSeverity.CRITICAL:
        return 4;
      case FraudSeverity.HIGH:
        return 3;
      case FraudSeverity.MEDIUM:
        return 2;
      case FraudSeverity.LOW:
      default:
        return 1;
    }
  }

  private normalizeAddress(value: string) {
    return value.trim().replace(/\s+/g, ' ').toUpperCase();
  }
}
