import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  FraudAlertStatus,
  FraudEntityType,
  FraudSeverity,
  Prisma,
  PropertyStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../email/email.service';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import {
  AddFraudInvestigationNoteDto,
  AssignFraudAlertDto,
  FraudAlertsQueryDto,
  ManualFraudBlockDto,
  UpdateFraudAlertStatusDto,
} from './dto/fraud.dto';

type DetectionInput = {
  userId?: string;
  entityType: FraudEntityType;
  entityId?: string;
  patternCode: string;
  title: string;
  description: string;
  severity: FraudSeverity;
  riskScore: number;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  autoBlock?: boolean;
};

const ACTIVE_ALERT_STATUSES: FraudAlertStatus[] = [
  FraudAlertStatus.OPEN,
  FraudAlertStatus.INVESTIGATING,
  FraudAlertStatus.BLOCKED,
];

const HIGH_VALUE_LISTING_THRESHOLD = 1_000_000;
const MEDIUM_RISK_TRUST_SCORE_THRESHOLD = 30;

@Injectable()
export class FraudService {
  private readonly logger = new Logger(FraudService.name);
  private readonly severityRank: Record<FraudSeverity, number> = {
    [FraudSeverity.LOW]: 1,
    [FraudSeverity.MEDIUM]: 2,
    [FraudSeverity.HIGH]: 3,
    [FraudSeverity.CRITICAL]: 4,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async analyzeFailedLogin(params: {
    email: string;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    reason?: string;
  }) {
    const normalizedEmail = params.email.trim().toLowerCase();
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [recentFailures, dailyFailureIps] = await Promise.all([
      this.prisma.loginAttempt.count({
        where: {
          email: normalizedEmail,
          success: false,
          attemptTime: { gte: fifteenMinutesAgo },
        },
      }),
      this.prisma.loginAttempt.findMany({
        where: {
          email: normalizedEmail,
          success: false,
          attemptTime: { gte: oneDayAgo },
          ipAddress: { not: null },
        },
        distinct: ['ipAddress'],
        select: { ipAddress: true },
      }),
    ]);

    if (recentFailures < 5) {
      return null;
    }

    const distinctFailureIps = dailyFailureIps.filter((entry) => entry.ipAddress).length;
    const credentialStuffing = distinctFailureIps >= 3 || recentFailures >= 10;

    return this.registerDetection({
      userId: params.userId,
      entityType: FraudEntityType.ACCOUNT,
      entityId: params.userId ?? normalizedEmail,
      patternCode: credentialStuffing ? 'CREDENTIAL_STUFFING_ATTACK' : 'FAILED_LOGIN_BURST',
      title: credentialStuffing
        ? 'Potential credential stuffing detected'
        : 'Burst of failed login attempts detected',
      description: credentialStuffing
        ? `Detected ${recentFailures} failed login attempts for ${normalizedEmail} with ${distinctFailureIps} distinct IP addresses in the last 24 hours.`
        : `Detected ${recentFailures} failed login attempts for ${normalizedEmail} in the last 15 minutes.`,
      severity: credentialStuffing ? FraudSeverity.CRITICAL : FraudSeverity.HIGH,
      riskScore: credentialStuffing ? 92 : 72,
      metadata: {
        email: normalizedEmail,
        recentFailures,
        distinctFailureIps,
        reason: params.reason ?? 'invalid_credentials',
      },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      autoBlock: Boolean(params.userId && credentialStuffing),
    });
  }

  async analyzeSuccessfulLogin(params: {
    userId: string;
    email: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const [distinctIps, activeSessions, recentSessions] = await Promise.all([
      this.prisma.loginHistory.findMany({
        where: {
          userId: params.userId,
          timestamp: { gte: oneDayAgo },
          ipAddress: { not: null },
        },
        distinct: ['ipAddress'],
        select: { ipAddress: true },
      }),
      this.prisma.session.count({
        where: {
          userId: params.userId,
          isRevoked: false,
          expiresAt: { gt: new Date() },
        },
      }),
      this.prisma.session.count({
        where: {
          userId: params.userId,
          createdAt: { gte: oneHourAgo },
        },
      }),
    ]);

    const alerts = [];
    const distinctIpCount = distinctIps.filter((entry) => entry.ipAddress).length;

    if (distinctIpCount >= 3) {
      alerts.push(
        this.registerDetection({
          userId: params.userId,
          entityType: FraudEntityType.SESSION,
          entityId: params.userId,
          patternCode: 'LOGIN_IP_ROTATION',
          title: 'Rapid IP rotation detected',
          description: `User ${params.email} has authenticated from ${distinctIpCount} distinct IP addresses in the last 24 hours.`,
          severity: distinctIpCount >= 5 ? FraudSeverity.HIGH : FraudSeverity.MEDIUM,
          riskScore: distinctIpCount >= 5 ? 78 : 58,
          metadata: {
            email: params.email,
            distinctIpCount,
            activeSessions,
            recentSessions,
          },
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
        }),
      );
    }

    if (activeSessions >= 5 || recentSessions >= 4) {
      alerts.push(
        this.registerDetection({
          userId: params.userId,
          entityType: FraudEntityType.SESSION,
          entityId: params.userId,
          patternCode: 'SESSION_BURST',
          title: 'Unusual session burst detected',
          description: `User ${params.email} has ${activeSessions} active sessions and ${recentSessions} sessions created within the last hour.`,
          severity:
            activeSessions >= 7 || recentSessions >= 6 ? FraudSeverity.HIGH : FraudSeverity.MEDIUM,
          riskScore: activeSessions >= 7 || recentSessions >= 6 ? 70 : 52,
          metadata: {
            email: params.email,
            activeSessions,
            recentSessions,
          },
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
        }),
      );
    }

    return Promise.all(alerts);
  }

  async handleTokenReuseDetection(params: {
    userId: string;
    email?: string;
    tokenFamily?: string;
    jti: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.registerDetection({
      userId: params.userId,
      entityType: FraudEntityType.TOKEN,
      entityId: params.tokenFamily ?? params.jti,
      patternCode: 'REFRESH_TOKEN_REUSE',
      title: 'Refresh token reuse detected',
      description: `Refresh token reuse was detected for user ${params.email ?? params.userId}.`,
      severity: FraudSeverity.CRITICAL,
      riskScore: 98,
      metadata: {
        email: params.email,
        tokenFamily: params.tokenFamily,
        jti: params.jti,
      },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      autoBlock: true,
    });
  }

  async analyzePropertyListing(propertyId: string, actorRole?: UserRole) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            role: true,
            isVerified: true,
            trustScore: true,
            createdAt: true,
          },
        },
      },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const propertyPrice = this.toNumber(property.price);
    const normalizedAddress = this.normalizePropertyAddress({
      address: property.address,
      city: property.city,
      state: property.state,
      zipCode: property.zipCode,
    });

    const [cityListings, exactAreaListings] = await Promise.all([
      this.prisma.property.findMany({
        where: {
          id: { not: property.id },
          city: property.city,
          state: property.state,
          status: {
            in: [PropertyStatus.PENDING, PropertyStatus.ACTIVE, PropertyStatus.UNDER_CONTRACT],
          },
        },
        select: {
          id: true,
          ownerId: true,
          address: true,
          city: true,
          state: true,
          zipCode: true,
          price: true,
          status: true,
        },
      }),
      this.prisma.property.findMany({
        where: {
          id: { not: property.id },
          zipCode: property.zipCode,
        },
        select: {
          id: true,
          ownerId: true,
          address: true,
          city: true,
          state: true,
          zipCode: true,
          price: true,
          status: true,
        },
      }),
    ]);

    const duplicateListings = exactAreaListings.filter(
      (candidate) =>
        this.normalizePropertyAddress(candidate) === normalizedAddress &&
        candidate.ownerId !== property.ownerId,
    );

    const medianPrice = this.calculateMedian(
      cityListings.map((listing) => this.toNumber(listing.price)).filter((price) => price > 0),
    );
    const accountAgeDays = this.getAccountAgeDays(property.owner.createdAt);

    const alerts = [];
    let shouldHoldListing = false;

    if (duplicateListings.length > 0) {
      shouldHoldListing = true;
      alerts.push(
        this.registerDetection({
          userId: property.ownerId,
          entityType: FraudEntityType.PROPERTY,
          entityId: property.id,
          patternCode: 'DUPLICATE_PROPERTY_ADDRESS',
          title: 'Duplicate property listing detected',
          description: `Property ${property.id} matches an address already listed by another account.`,
          severity: FraudSeverity.HIGH,
          riskScore: 85,
          metadata: {
            propertyId: property.id,
            duplicateListingIds: duplicateListings.map((listing) => listing.id),
            normalizedAddress,
          },
        }),
      );
    }

    if (
      propertyPrice >= HIGH_VALUE_LISTING_THRESHOLD &&
      (!property.owner.isVerified ||
        property.owner.trustScore <= MEDIUM_RISK_TRUST_SCORE_THRESHOLD ||
        accountAgeDays < 7)
    ) {
      shouldHoldListing = true;
      alerts.push(
        this.registerDetection({
          userId: property.ownerId,
          entityType: FraudEntityType.PROPERTY,
          entityId: property.id,
          patternCode: 'HIGH_VALUE_UNVERIFIED_LISTING',
          title: 'High-value listing from low-trust account detected',
          description: `Property ${property.id} is priced at ${propertyPrice} and was submitted by an account that is new, unverified, or has a low trust score.`,
          severity: FraudSeverity.HIGH,
          riskScore: 82,
          metadata: {
            propertyId: property.id,
            propertyPrice,
            trustScore: property.owner.trustScore,
            isVerified: property.owner.isVerified,
            accountAgeDays,
          },
        }),
      );
    }

    if (medianPrice && cityListings.length >= 3) {
      const lowOutlier = propertyPrice < medianPrice * 0.35;
      const highOutlier = propertyPrice > medianPrice * 2.5;

      if (lowOutlier || highOutlier) {
        alerts.push(
          this.registerDetection({
            userId: property.ownerId,
            entityType: FraudEntityType.PROPERTY,
            entityId: property.id,
            patternCode: 'PROPERTY_PRICE_OUTLIER',
            title: 'Property pricing outlier detected',
            description: `Property ${property.id} is priced far outside the city median of ${medianPrice}.`,
            severity: FraudSeverity.MEDIUM,
            riskScore: 54,
            metadata: {
              propertyId: property.id,
              propertyPrice,
              cityMedianPrice: medianPrice,
              varianceRatio: Number((propertyPrice / medianPrice).toFixed(2)),
              comparableListingCount: cityListings.length,
            },
          }),
        );
      }
    }

    const createdAlerts = await Promise.all(alerts);
    const allowAutoHold = actorRole !== UserRole.ADMIN;
    const holdApplied =
      shouldHoldListing && allowAutoHold
        ? await this.placePropertyOnHold(property.id, property.ownerId)
        : false;

    return {
      alerts: createdAlerts.filter(Boolean),
      holdApplied,
      propertyId: property.id,
    };
  }

  async listAlerts(query: FraudAlertsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Prisma.FraudAlertWhereInput = {};

    if (query.severity) {
      where.severity = query.severity;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.entityType) {
      where.entityType = query.entityType;
    }

    if (query.entityId) {
      where.entityId = query.entityId;
    }

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.patternCode) {
      where.patternCode = query.patternCode;
    }

    if (typeof query.autoBlocked === 'boolean') {
      where.autoBlocked = query.autoBlocked;
    }

    const [alerts, total] = await Promise.all([
      this.prisma.fraudAlert.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastDetectedAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              isBlocked: true,
              trustScore: true,
            },
          },
        },
      }),
      this.prisma.fraudAlert.count({ where }),
    ]);

    return {
      alerts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
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
            role: true,
            isBlocked: true,
            isVerified: true,
            trustScore: true,
            createdAt: true,
          },
        },
        signals: {
          orderBy: { createdAt: 'desc' },
          take: 25,
        },
        notes: {
          orderBy: { createdAt: 'desc' },
          take: 25,
        },
      },
    });

    if (!alert) {
      throw new NotFoundException('Fraud alert not found');
    }

    const userContextPromise = alert.userId
      ? this.buildUserInvestigationContext(alert.userId, alert.user?.email)
      : Promise.resolve(null);
    const propertyContextPromise =
      alert.entityType === FraudEntityType.PROPERTY && alert.entityId
        ? this.buildPropertyInvestigationContext(alert.entityId)
        : Promise.resolve(null);
    const relatedAlertsPromise = alert.userId
      ? this.prisma.fraudAlert.findMany({
          where: {
            userId: alert.userId,
            id: { not: alert.id },
            status: { in: ACTIVE_ALERT_STATUSES },
          },
          orderBy: { lastDetectedAt: 'desc' },
          take: 10,
        })
      : Promise.resolve([]);

    const [userContext, propertyContext, relatedOpenAlerts] = await Promise.all([
      userContextPromise,
      propertyContextPromise,
      relatedAlertsPromise,
    ]);

    return {
      alert,
      investigation: {
        userContext,
        propertyContext,
        relatedOpenAlerts,
      },
    };
  }

  async assignAlert(alertId: string, actor: AuthUserPayload, dto: AssignFraudAlertDto) {
    const assignedToId = dto.assignedToId ?? actor.sub;
    const assignedToEmail = dto.assignedToEmail ?? actor.email;

    const alert = await this.prisma.fraudAlert.update({
      where: { id: alertId },
      data: {
        assignedToId,
        assignedToEmail,
        status: FraudAlertStatus.INVESTIGATING,
      },
    });

    await this.prisma.fraudInvestigationNote.create({
      data: {
        alertId,
        authorId: actor.sub,
        authorEmail: actor.email,
        note: `Alert assigned to ${assignedToEmail}.`,
      },
    });

    return alert;
  }

  async updateAlertStatus(alertId: string, actor: AuthUserPayload, dto: UpdateFraudAlertStatusDto) {
    const alert = await this.prisma.fraudAlert.findUnique({
      where: { id: alertId },
      select: { id: true, userId: true },
    });

    if (!alert) {
      throw new NotFoundException('Fraud alert not found');
    }

    if (dto.status === FraudAlertStatus.BLOCKED && alert.userId) {
      await this.blockUserForFraud(
        alert.userId,
        {
          reason: dto.resolutionNotes ?? 'User blocked during fraud investigation.',
        },
        actor,
        alert.id,
      );
    }

    const updatedAlert = await this.prisma.fraudAlert.update({
      where: { id: alertId },
      data: {
        status: dto.status,
        resolutionNotes: dto.resolutionNotes,
        resolvedAt:
          dto.status === FraudAlertStatus.RESOLVED || dto.status === FraudAlertStatus.DISMISSED
            ? new Date()
            : null,
      },
    });

    await this.prisma.fraudInvestigationNote.create({
      data: {
        alertId,
        authorId: actor.sub,
        authorEmail: actor.email,
        note: dto.resolutionNotes
          ? `Status updated to ${dto.status}. ${dto.resolutionNotes}`
          : `Status updated to ${dto.status}.`,
      },
    });

    return updatedAlert;
  }

  async addInvestigationNote(
    alertId: string,
    actor: AuthUserPayload,
    dto: AddFraudInvestigationNoteDto,
  ) {
    await this.ensureAlertExists(alertId);

    return this.prisma.fraudInvestigationNote.create({
      data: {
        alertId,
        authorId: actor.sub,
        authorEmail: actor.email,
        note: dto.note,
      },
    });
  }

  async scanUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [failedLoginAlert, loginAlerts, propertyIds] = await Promise.all([
      this.analyzeFailedLogin({
        email: user.email,
        userId: user.id,
        reason: 'manual_scan',
      }),
      this.analyzeSuccessfulLogin({
        userId: user.id,
        email: user.email,
      }),
      this.prisma.property.findMany({
        where: {
          ownerId: user.id,
          status: {
            in: [PropertyStatus.PENDING, PropertyStatus.ACTIVE, PropertyStatus.UNDER_CONTRACT],
          },
        },
        select: { id: true },
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const propertyResults = await Promise.all(
      propertyIds.map((property) => this.analyzePropertyListing(property.id, user.role)),
    );

    return {
      userId,
      alerts: [
        failedLoginAlert,
        ...loginAlerts,
        ...propertyResults.flatMap((result) => result.alerts),
      ].filter(Boolean),
      scannedAt: new Date(),
    };
  }

  async scanProperty(propertyId: string) {
    return this.analyzePropertyListing(propertyId, UserRole.ADMIN);
  }

  async blockUserForAlert(alertId: string, actor: AuthUserPayload, dto: ManualFraudBlockDto) {
    const alert = await this.prisma.fraudAlert.findUnique({
      where: { id: alertId },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!alert) {
      throw new NotFoundException('Fraud alert not found');
    }

    if (!alert.userId) {
      throw new BadRequestException('This alert is not associated with a user account');
    }

    return this.blockUserForFraud(alert.userId, dto, actor, alert.id);
  }

  private async ensureAlertExists(alertId: string) {
    const exists = await this.prisma.fraudAlert.findUnique({
      where: { id: alertId },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException('Fraud alert not found');
    }
  }

  private async registerDetection(input: DetectionInput) {
    const now = new Date();
    let notifyAlert = false;

    const result = await this.prisma.$transaction(async (tx) => {
      const existingAlert = await tx.fraudAlert.findFirst({
        where: {
          userId: input.userId ?? null,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          patternCode: input.patternCode,
          status: { in: ACTIVE_ALERT_STATUSES },
        },
      });

      const nextSeverity = existingAlert
        ? this.maxSeverity(existingAlert.severity, input.severity)
        : input.severity;
      const mergedMetadata = this.mergeMetadata(existingAlert?.metadata, input.metadata);
      const shouldBlock = Boolean(input.autoBlock && input.userId);

      const alert = existingAlert
        ? await tx.fraudAlert.update({
            where: { id: existingAlert.id },
            data: {
              title: input.title,
              description: input.description,
              severity: nextSeverity,
              riskScore: Math.max(existingAlert.riskScore, input.riskScore),
              detectionCount: existingAlert.detectionCount + 1,
              lastDetectedAt: now,
              metadata: mergedMetadata,
              status: shouldBlock ? FraudAlertStatus.BLOCKED : existingAlert.status,
              autoBlocked: existingAlert.autoBlocked || shouldBlock,
              blockedAt:
                shouldBlock && !existingAlert.blockedAt ? now : (existingAlert.blockedAt ?? null),
            },
          })
        : await tx.fraudAlert.create({
            data: {
              userId: input.userId,
              entityType: input.entityType,
              entityId: input.entityId,
              patternCode: input.patternCode,
              title: input.title,
              description: input.description,
              severity: input.severity,
              riskScore: input.riskScore,
              metadata: mergedMetadata,
              status: shouldBlock ? FraudAlertStatus.BLOCKED : FraudAlertStatus.OPEN,
              autoBlocked: shouldBlock,
              blockedAt: shouldBlock ? now : null,
              firstDetectedAt: now,
              lastDetectedAt: now,
            },
          });

      await tx.fraudSignal.create({
        data: {
          alertId: alert.id,
          userId: input.userId,
          entityType: input.entityType,
          entityId: input.entityId,
          patternCode: input.patternCode,
          title: input.title,
          description: input.description,
          severity: input.severity,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          metadata: input.metadata as Prisma.InputJsonValue | undefined,
        },
      });

      if (shouldBlock && input.userId) {
        await this.applyUserBlock(tx, input.userId, input.description, alert.id);
      }

      if (input.userId) {
        await tx.activityLog.create({
          data: {
            userId: input.userId,
            action: shouldBlock ? 'FRAUD_AUTO_BLOCK' : 'FRAUD_ALERT_TRIGGERED',
            entityType: input.entityType,
            entityId: input.entityId,
            description: input.description,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            metadata: mergedMetadata,
          },
        });
      }

      notifyAlert =
        !existingAlert ||
        this.severityRank[nextSeverity] > this.severityRank[existingAlert.severity] ||
        shouldBlock;

      return alert;
    });

    if (
      notifyAlert &&
      this.severityRank[result.severity] >= this.severityRank[FraudSeverity.HIGH]
    ) {
      await this.emailService.sendFraudAlertEmail({
        alertId: result.id,
        title: result.title,
        severity: result.severity,
        description: result.description,
        userId: result.userId ?? undefined,
        entityType: result.entityType,
        entityId: result.entityId ?? undefined,
        autoBlocked: result.autoBlocked,
      });
    }

    return result;
  }

  private async applyUserBlock(
    tx: Prisma.TransactionClient,
    userId: string,
    reason: string,
    alertId?: string,
  ) {
    await tx.user.update({
      where: { id: userId },
      data: {
        isBlocked: true,
      },
    });

    await tx.session.updateMany({
      where: {
        userId,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });

    await tx.fraudAlert.updateMany({
      where: {
        userId,
        status: { in: [FraudAlertStatus.OPEN, FraudAlertStatus.INVESTIGATING] },
      },
      data: {
        status: FraudAlertStatus.BLOCKED,
        autoBlocked: true,
        blockedAt: new Date(),
      },
    });

    if (alertId) {
      await tx.fraudInvestigationNote.create({
        data: {
          alertId,
          note: `Automatic user block applied. ${reason}`,
        },
      });
    }
  }

  private async blockUserForFraud(
    userId: string,
    dto: ManualFraudBlockDto,
    actor: AuthUserPayload,
    alertId?: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          isBlocked: true,
        },
      });

      await tx.session.updateMany({
        where: {
          userId,
          isRevoked: false,
        },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
        },
      });

      if (alertId) {
        await tx.fraudAlert.update({
          where: { id: alertId },
          data: {
            status: FraudAlertStatus.BLOCKED,
            autoBlocked: false,
            blockedAt: new Date(),
            resolutionNotes: dto.reason,
          },
        });

        await tx.fraudInvestigationNote.create({
          data: {
            alertId,
            authorId: actor.sub,
            authorEmail: actor.email,
            note: `Manual user block applied. ${dto.reason}`,
          },
        });
      }

      await tx.activityLog.create({
        data: {
          userId,
          action: 'FRAUD_MANUAL_BLOCK',
          entityType: FraudEntityType.USER,
          entityId: userId,
          description: dto.reason,
          metadata: {
            actorId: actor.sub,
            actorEmail: actor.email,
            alertId,
          },
        },
      });

      return {
        userId,
        blocked: true,
        reason: dto.reason,
      };
    });

    await this.emailService.sendFraudAlertEmail({
      alertId,
      title: 'Manual fraud block applied',
      severity: FraudSeverity.CRITICAL,
      description: dto.reason,
      userId,
      entityType: FraudEntityType.USER,
      entityId: userId,
      autoBlocked: false,
    });

    return result;
  }

  private async placePropertyOnHold(propertyId: string, userId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!property || property.status !== PropertyStatus.ACTIVE) {
      return false;
    }

    await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        status: PropertyStatus.PENDING,
      },
    });

    await this.prisma.activityLog.create({
      data: {
        userId,
        action: 'FRAUD_PROPERTY_HOLD',
        entityType: FraudEntityType.PROPERTY,
        entityId: propertyId,
        description: 'Property was moved back to pending review due to fraud signals.',
        metadata: {
          propertyId,
          previousStatus: property.status,
          nextStatus: PropertyStatus.PENDING,
        },
      },
    });

    return true;
  }

  private async buildUserInvestigationContext(userId: string, email?: string | null) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [sessions, loginHistory, activityLogs, openAlerts, loginAttempts] = await Promise.all([
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
        take: 20,
      }),
      this.prisma.fraudAlert.count({
        where: {
          userId,
          status: { in: ACTIVE_ALERT_STATUSES },
        },
      }),
      email
        ? this.prisma.loginAttempt.findMany({
            where: {
              email,
              attemptTime: { gte: twentyFourHoursAgo },
            },
            orderBy: { attemptTime: 'desc' },
            take: 20,
          })
        : Promise.resolve([]),
    ]);

    return {
      openAlerts,
      recentSessions: sessions,
      recentLoginHistory: loginHistory,
      recentActivity: activityLogs,
      recentLoginAttempts: loginAttempts,
    };
  }

  private async buildPropertyInvestigationContext(propertyId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            trustScore: true,
            isVerified: true,
          },
        },
      },
    });

    if (!property) {
      return null;
    }

    const normalizedAddress = this.normalizePropertyAddress(property);
    const similarProperties = await this.prisma.property.findMany({
      where: {
        id: { not: property.id },
        zipCode: property.zipCode,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      property,
      duplicateCandidates: similarProperties.filter(
        (candidate) => this.normalizePropertyAddress(candidate) === normalizedAddress,
      ),
    };
  }

  private maxSeverity(a: FraudSeverity, b: FraudSeverity) {
    return this.severityRank[a] >= this.severityRank[b] ? a : b;
  }

  private mergeMetadata(
    existingMetadata: Prisma.JsonValue | null | undefined,
    incomingMetadata?: Record<string, unknown>,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    const current = this.toPlainObject(existingMetadata);
    const next = incomingMetadata ?? {};

    if (Object.keys(current).length === 0 && Object.keys(next).length === 0) {
      return undefined;
    }

    const merged = {
      ...current,
      ...next,
      latestSeenAt: new Date().toISOString(),
    };

    return merged as Prisma.InputJsonValue;
  }

  private toPlainObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private toNumber(value: Prisma.Decimal | number) {
    return typeof value === 'number' ? value : Number(value.toString());
  }

  private normalizePropertyAddress(property: {
    address: string;
    city: string;
    state: string;
    zipCode?: string | null;
  }) {
    return [property.address, property.city, property.state, property.zipCode ?? '']
      .join(' ')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  private calculateMedian(values: number[]) {
    if (values.length === 0) {
      return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const midpoint = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return Number(((sorted[midpoint - 1] + sorted[midpoint]) / 2).toFixed(2));
    }

    return Number(sorted[midpoint].toFixed(2));
  }

  private getAccountAgeDays(createdAt: Date) {
    return Math.floor((Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000));
  }
}
