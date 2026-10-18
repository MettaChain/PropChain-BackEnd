import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppLogger } from '../common/logger';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreatePropertyDto, UpdatePropertyDto } from './dto/property.dto';
import { AssignAgentDto, UpdateAgentAssignmentDto } from './dto/agent-assignment.dto';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { SearchPropertiesDto } from './dto/search-properties.dto';
import { CreateAmenityDto, UpdateAmenityDto } from './dto/amenity.dto';
import { FraudService } from '../fraud/fraud.service';
import { GeocodingService } from './geocoding.service';
import { PropertyStatus, UserRole } from '../types/prisma.types';
import { retryListingQuery } from './listing-retry.util';
import { CacheService } from '../cache/cache.service';
import { CACHE_TAGS } from '../cache/cache.config';
import {
  canTransitionPropertyStatus,
  getAllowedNextPropertyStatuses,
  DEFAULT_PROPERTY_STATUS,
} from './property-status.constants';
import { propertiesTotal } from '../metrics/metrics.controller';
import { isTransientGeocodeError, retryWithBackoff } from './retry.util';
import { buildSearchWhereClause } from './search-where.builder';

interface FindAllParams {
  skip?: number;
  take?: number;
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
}

export interface PaginatedPropertiesResult<T = unknown> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class PropertiesService {
  private geocodeRateLimitWindow = 60 * 1000;
  private geocodeMaxPerMinute = 50;
  private geocodeTimestamps: number[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly fraudService: FraudService,
    private readonly geocodingService: GeocodingService,
    private readonly cacheService: CacheService,
  ) {}

  private async checkGeocodeRateLimit(): Promise<boolean> {
    const now = Date.now();
    this.geocodeTimestamps = this.geocodeTimestamps.filter(
      (t) => now - t < this.geocodeRateLimitWindow,
    );
    return this.geocodeTimestamps.length < this.geocodeMaxPerMinute;
  }

  private async recordGeocodeCall(): Promise<void> {
    this.geocodeTimestamps.push(Date.now());
  }

  private async shouldGeocode(
    propertyId: string,
    addressFields: {
      address: string;
      city: string;
      state: string;
      zipCode: string;
      country: string;
    },
  ): Promise<boolean> {
    const existing = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        address: true,
        city: true,
        state: true,
        zipCode: true,
        country: true,
        latitude: true,
        longitude: true,
      },
    });

    if (!existing) return false;
    if (existing.latitude && existing.longitude) return false;
    return this.geocodingService.hasAddressChanged(
      {
        address: existing.address,
        city: existing.city,
        state: existing.state,
        zipCode: existing.zipCode,
        country: existing.country,
      },
      addressFields,
    );
  }

  private async attemptGeocode(
    propertyId: string,
    addressFields: {
      address: string;
      city: string;
      state: string;
      zipCode: string;
      country: string;
    },
  ): Promise<{ lat: number; lng: number } | null> {
    if (!(await this.shouldGeocode(propertyId, addressFields))) {
      return null;
    }

    if (!(await this.checkGeocodeRateLimit())) {
      this.logger.warn('Geocoding rate limit hit', { event: 'properties.geocode_rate_limited', propertyId });
      return null;
    }

    await this.recordGeocodeCall();

    // Geocoding is an external HTTP provider, so a timeout or a 5xx is usually
    // transient. Retry those a couple of times before giving up on coordinates;
    // the property itself has already been validated at this point.
    const geo = await retryWithBackoff(() => this.geocodingService.geocodeAddress(addressFields), {
      attempts: 3,
      baseDelayMs: 200,
      maxDelayMs: 2_000,
      isRetryable: isTransientGeocodeError,
    }).catch(() => null);

    if (!geo) {
      await this.markGeocodingFailed(propertyId);
      return null;
    }

    return { lat: geo.latitude, lng: geo.longitude };
  }

  private async markGeocodingFailed(propertyId: string): Promise<void> {
    const existing = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { metadata: true } as unknown as Prisma.PropertySelect,
    });

    const metadata =
      ((existing as { metadata?: unknown } | null)?.metadata as Record<string, any>) || {};
    await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        metadata: {
          ...metadata,
          regeocodingFailed: true,
          regeocodingFailedAt: new Date().toISOString(),
        },
      } as any,
    });
  }

  private readonly logger = new AppLogger('PropertiesService');

  async create(createPropertyDto: CreatePropertyDto, ownerId: string) {
    const { price, squareFeet, lotSize, latitude, longitude, hoaMonthlyFee, ...rest } =
      createPropertyDto;

    // Duplicate address check
    const duplicate = await this.prisma.property.findFirst({
      where: {
        address: rest.address,
        city: rest.city,
        state: rest.state,
        zipCode: rest.zipCode,
        country: rest.country,
      },
    });
    if (duplicate) {
      throw new BadRequestException('A property with this address already exists.');
    }

    // Auto-geocode when the caller didn't supply coordinates explicitly.
    let resolvedLat = latitude;
    let resolvedLng = longitude;
    if (resolvedLat === undefined || resolvedLng === undefined) {
      const geo = await this.attemptGeocode('new', {
        address: rest.address,
        city: rest.city,
        state: rest.state,
        zipCode: rest.zipCode,
        country: rest.country || 'USA',
      });
      if (geo) {
        resolvedLat = geo.lat;
        resolvedLng = geo.lng;
      }
    }

    const property = await this.prisma.property.create({
      data: {
        ...rest,
        price: new Decimal(price.toString()),
        squareFeet: squareFeet ? new Decimal(squareFeet.toString()) : null,
        lotSize: lotSize ? new Decimal(lotSize.toString()) : null,
        hoaMonthlyFee: hoaMonthlyFee !== undefined ? new Decimal(hoaMonthlyFee.toString()) : null,
        status: DEFAULT_PROPERTY_STATUS,
        latitude: resolvedLat,
        longitude: resolvedLng,
        owner: {
          connect: { id: ownerId },
        },
      },
    });

    propertiesTotal.inc();
    this.logger.log('Property created', {
      event: 'properties.created',
      propertyId: property.id,
      ownerId,
    });

    // The property already exists at this point. If a follow-up step fails, report
    // it in the logs but still return the property: failing the request would make
    // the client retry and hit the "address already exists" error for its own record.
    try {
      await this.fraudService.evaluatePropertyCreated(property.id);
    } catch (err) {
      this.logger.error('Fraud evaluation failed for new property', {
        event: 'properties.fraud_evaluation_failed',
        propertyId: property.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    try {
      await this.cacheService.invalidateByTag(CACHE_TAGS.PROPERTIES);
    } catch (err) {
      this.logger.warn('Property cache invalidation failed', {
        event: 'properties.cache_invalidation_failed',
        propertyId: property.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return property;
  }

  async findAll(params?: FindAllParams) {
    const { skip, take, where, orderBy } = params || {};
    const finalWhere = where
      ? { ...where, status: where.status ?? PropertyStatus.ACTIVE, deleted: false }
      : { status: PropertyStatus.ACTIVE, deleted: false };

    return (this.prisma.property as any).findMany({
      skip,
      take,
      where: finalWhere,
      orderBy,
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        agents: {
          include: {
            agent: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
    });
  }

  async findOne(id: string) {
    return (this.prisma.property as any).findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        documents: true,
        agents: {
          include: {
            agent: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
    });
  }

  async update(id: string, updatePropertyDto: UpdatePropertyDto, userId?: string) {
    const { price, squareFeet, lotSize, latitude, longitude, hoaMonthlyFee, ...rest } =
      updatePropertyDto;

    // Get existing property to check for price changes
    const existingProperty = await this.prisma.property.findUnique({ where: { id } });
    if (!existingProperty) throw new NotFoundException(`Property ${id} not found`);

    // Record price change if price is being updated
    if (price !== undefined && price !== Number(existingProperty.price)) {
      const oldPrice = existingProperty.price;
      const newPrice = new Decimal(price.toString());
      const changeAmount = newPrice.minus(oldPrice);
      const changePercentage = oldPrice.equals(new Decimal(0))
        ? 0
        : changeAmount.div(oldPrice).mul(100).toNumber();

      await this.prisma.propertyPriceHistory.create({
        data: {
          propertyId: id,
          oldPrice,
          newPrice,
          changeAmount,
          changePercentage,
          changedBy: userId,
          changeReason: (rest as { changeReason?: string }).changeReason || null,
        },
      });
    }

    // Duplicate address check (if address fields are being updated)
    if (rest.address || rest.city || rest.state || rest.zipCode || rest.country) {
      const newAddress = {
        address: rest.address ?? existingProperty.address,
        city: rest.city ?? existingProperty.city,
        state: rest.state ?? existingProperty.state,
        zipCode: rest.zipCode ?? existingProperty.zipCode,
        country: rest.country ?? existingProperty.country,
      };
      const duplicate = await this.prisma.property.findFirst({
        where: {
          ...newAddress,
          NOT: { id },
        },
      });
      if (duplicate) {
        throw new BadRequestException('A property with this address already exists.');
      }
    }

    // If the user explicitly provided lat/lng, honor them. Otherwise,
    // re-geocode when any address-defining field changes.
    let resolvedLat = latitude;
    let resolvedLng = longitude;
    const callerProvidedCoords = latitude !== undefined && longitude !== undefined;

    if (!callerProvidedCoords) {
      const existing = await this.prisma.property.findUnique({
        where: { id },
        select: {
          address: true,
          city: true,
          state: true,
          zipCode: true,
          country: true,
          latitude: true,
          longitude: true,
        },
      });

      if (existing) {
        const before = {
          address: existing.address,
          city: existing.city,
          state: existing.state,
          zipCode: existing.zipCode,
          country: existing.country,
        };
        const after = {
          address: rest.address ?? existing.address,
          city: rest.city ?? existing.city,
          state: rest.state ?? existing.state,
          zipCode: rest.zipCode ?? existing.zipCode,
          country: rest.country ?? existing.country,
        };

        if (this.geocodingService.hasAddressChanged(before, after)) {
          if (existing.latitude && existing.longitude) {
            resolvedLat = existing.latitude;
            resolvedLng = existing.longitude;
          } else {
            const geo = await this.attemptGeocode(id, after);
            if (geo) {
              resolvedLat = geo.lat;
              resolvedLng = geo.lng;
            }
          }
        }
      }
    }

    const updatedProperty = await this.prisma.property.update({
      where: { id },
      data: {
        ...rest,
        price: price ? new Decimal(price.toString()) : undefined,
        squareFeet: squareFeet ? new Decimal(squareFeet.toString()) : undefined,
        lotSize: lotSize ? new Decimal(lotSize.toString()) : undefined,
        hoaMonthlyFee:
          hoaMonthlyFee !== undefined ? new Decimal(hoaMonthlyFee.toString()) : undefined,
        latitude: resolvedLat,
        longitude: resolvedLng,
        expiryDate: updatePropertyDto.expiryDate,
      },
    });

    await this.cacheService.invalidateByTag(CACHE_TAGS.PROPERTIES);
    return updatedProperty;
  }

  async remove(id: string, user: AuthUserPayload) {
    const property = await this.prisma.property.findUnique({
      where: { id },
    });

    if (!property) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }

    // Authorization check: only property owner or admin can delete
    if (property.ownerId !== user.sub && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You are not authorized to delete this property');
    }

    const updated = await this.prisma.property.update({
      where: { id },
      data: {
        deleted: true,
        deletedAt: new Date(),
        deletedById: user.sub,
        status: PropertyStatus.ARCHIVED,
      },
    });

    await this.cacheService.invalidateByTag(CACHE_TAGS.PROPERTIES);
    this.logger.warn('Property deleted', { event: 'properties.deleted', propertyId: id, userId: user.sub });
    return updated;
  }

  async restore(id: string, user: AuthUserPayload) {
    const property = await this.prisma.property.findUnique({
      where: { id },
    });

    if (!property) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }

    // Authorization check: only admin can restore
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You are not authorized to restore this property');
    }

    const updated = await this.prisma.property.update({
      where: { id },
      data: {
        deleted: false,
        deletedAt: null,
        deletedById: null,
        status: PropertyStatus.DRAFT, // Or the original status before deletion
      },
    });

    await this.cacheService.invalidateByTag(CACHE_TAGS.PROPERTIES);
    this.logger.log('Property restored', { event: 'properties.restored', propertyId: id, userId: user.sub });
    return updated;
  }

  async findByOwnerId(ownerId: string) {
    return this.prisma.property.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Expire properties that have passed their expiry date.
   * This method should be called periodically by a scheduled job.
   */
  async expireProperties(): Promise<{ updatedCount: number }> {
    const now = new Date();
    const result = await this.prisma.property.updateMany({
      where: {
        expiryDate: {
          lt: now, // Less than now (expired)
        },
        status: {
          notIn: [
            PropertyStatus.SOLD,
            PropertyStatus.RENTED,
            PropertyStatus.ARCHIVED,
            PropertyStatus.EXPIRED, // Already expired
          ],
        },
      },
      data: {
        status: PropertyStatus.EXPIRED,
      },
    });

    return { updatedCount: result.count };
  }

  /**
   * Transition a property's status according to the workflow state machine.
   *
   * Allowed happy path: DRAFT → PENDING → ACTIVE → UNDER_CONTRACT → SOLD.
   * See `property-status.constants.ts` for the full transition map.
   *
   * Authorization: only the owner, an AGENT, or an ADMIN may transition.
   *
   * Throws:
   * - NotFoundException if the property doesn't exist
   * - ForbiddenException if the caller isn't allowed to mutate this property
   * - BadRequestException if the transition isn't allowed by the workflow
   */
  async transitionStatus(
    propertyId: string,
    nextStatus: PropertyStatus,
    actorId: string,
    actorRole: UserRole | string,
  ) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, ownerId: true, status: true },
    });

    if (!property) {
      throw new NotFoundException(`Property ${propertyId} not found`);
    }

    const isOwner = property.ownerId === actorId;
    const isPrivileged = actorRole === UserRole.ADMIN || actorRole === UserRole.AGENT;
    if (!isOwner && !isPrivileged) {
      throw new ForbiddenException('You are not allowed to change the status of this property');
    }

    const currentStatus = property.status as PropertyStatus;

    // Idempotent no-op: don't update, but echo the property back so callers
    // can rely on a consistent shape.
    if (currentStatus === nextStatus) {
      return this.findOne(propertyId);
    }

    if (!canTransitionPropertyStatus(currentStatus, nextStatus)) {
      const allowed = getAllowedNextPropertyStatuses(currentStatus).join(', ');
      throw new BadRequestException(
        `Cannot transition property from ${currentStatus} to ${nextStatus}. ` +
          `Allowed next statuses: ${allowed || '(none)'}`,
      );
    }

    await this.prisma.property.update({
      where: { id: propertyId },
      data: { status: nextStatus },
    });

    return this.findOne(propertyId);
  }

  /**
   * Advanced property search with filters, pagination and sorting.
   * Returns a paginated result so clients can render result counts and pages.
   *
   * Split into the two strategies it actually has. A trust-score range cannot
   * be expressed as a SQL predicate, because the score is computed from five
   * neighborhood columns, so it has to filter in memory; everything else pages
   * in the database. Both branches plus the row annotation and the result
   * shaping used to live in one 80-line method, which made the paging rules and
   * the trust-score rules impossible to change independently.
   */
  async searchProperties(dto: SearchPropertiesDto): Promise<PaginatedPropertiesResult> {

    const where = buildSearchWhereClause(dto);


    const where = this.buildSearchWhereClause(dto);

    const page = dto.page && dto.page > 0 ? dto.page : 1;
    const limit = dto.limit && dto.limit > 0 ? dto.limit : 20;
    const sort = { field: dto.sortBy ?? 'createdAt', order: dto.sortOrder ?? 'desc' } as {
      field: string;
      order: 'asc' | 'desc';
    };

    return this.hasTrustScoreFilter(dto)
      ? this.searchByTrustScore(dto, where, page, limit, sort)
      : this.searchByPaging(where, page, limit, sort);
  }

  private hasTrustScoreFilter(dto: SearchPropertiesDto): boolean {
    return dto.minNeighborhoodTrustScore !== undefined || dto.maxNeighborhoodTrustScore !== undefined;
  }

  /** Owner and neighborhood payload that every listing row is returned with. */
  private get searchRelations() {
    return {
      owner: { select: { id: true, firstName: true, lastName: true, email: true } },
      neighborhood: true,
    };
  }

  /** Attach the computed trust score to each row. No neighborhood scores null. */
  private annotateTrustScore(rows: any[]): any[] {
    return rows.map((p) => ({
      ...p,
      neighborhoodTrustScore: p.neighborhood
        ? this.computeNeighborhoodTrustScore(p.neighborhood)
        : null,
    }));
  }

  /**
   * A row without a neighborhood has no trust score, so it is excluded whenever
   * either bound is set - including a bound the score would have satisfied,
   * because "unknown" is not the same as "low".
   */
  private matchesTrustScoreRange(score: number | null, dto: SearchPropertiesDto): boolean {
    if (
      dto.minNeighborhoodTrustScore !== undefined &&
      (score === null || score < dto.minNeighborhoodTrustScore)
    ) {
      return false;
    }
    if (
      dto.maxNeighborhoodTrustScore !== undefined &&
      (score === null || score > dto.maxNeighborhoodTrustScore)
    ) {
      return false;
    }
    return true;
  }

  private buildPage<T>(
    items: T[],
    total: number,
    page: number,
    limit: number,
  ): PaginatedPropertiesResult<T> {
    return { items, total, page, limit, totalPages: limit > 0 ? Math.ceil(total / limit) : 0 };
  }

  /**
   * Trust-score search: fetch every row matching the other filters, then filter
   * and page in memory. `skip`/`take` cannot be pushed down here because the
   * score is derived rather than stored.
   */
  private async searchByTrustScore(
    dto: SearchPropertiesDto,
    where: Record<string, unknown>,
    page: number,
    limit: number,
    sort: { field: string; order: 'asc' | 'desc' },
  ): Promise<PaginatedPropertiesResult> {
    const allItems = await retryListingQuery(() =>
      this.prisma.property.findMany({
        where,
        orderBy: { [sort.field]: sort.order },
        include: this.searchRelations,
      }),
    );

    const filtered = this.annotateTrustScore(allItems as any[]).filter((p) =>
      this.matchesTrustScoreRange(p.neighborhoodTrustScore, dto),
    );

    const skip = (page - 1) * limit;
    return this.buildPage(filtered.slice(skip, skip + limit), filtered.length, page, limit);
  }

  /** The common case: page and count in one transaction so they cannot disagree. */
  private async searchByPaging(
    where: Record<string, unknown>,
    page: number,
    limit: number,
    sort: { field: string; order: 'asc' | 'desc' },
  ): Promise<PaginatedPropertiesResult> {
    const skip = (page - 1) * limit;

    const [rawItems, total] = await retryListingQuery(() =>
      this.prisma.$transaction([
        this.prisma.property.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sort.field]: sort.order },
          include: this.searchRelations,
        }),
        this.prisma.property.count({ where }),
      ]),
    );

    return this.buildPage(this.annotateTrustScore(rawItems as any[]), total, page, limit);
  }

  computeNeighborhoodTrustScore(neighborhood: any): number {
    const scores: number[] = [];
    if (neighborhood.walkScore != null) scores.push(neighborhood.walkScore);
    if (neighborhood.transitScore != null) scores.push(neighborhood.transitScore);
    if (neighborhood.bikeScore != null) scores.push(neighborhood.bikeScore);
    if (neighborhood.schoolRating != null) scores.push(neighborhood.schoolRating * 10);
    if (neighborhood.crimeIndex != null) scores.push(100 - neighborhood.crimeIndex);
    if (scores.length === 0) return 50;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  async approveProperty(propertyId: string, actorId: string) {
    return this.transitionStatus(propertyId, PropertyStatus.ACTIVE, actorId, UserRole.ADMIN);
  }

  async rejectProperty(propertyId: string, actorId: string) {
    return this.transitionStatus(propertyId, PropertyStatus.ARCHIVED, actorId, UserRole.ADMIN);
  }

  async bulkUpdatePropertyStatus(
    propertyIds: string[],
    status: PropertyStatus,
  ): Promise<{ updatedCount: number }> {
    const validStatus =
      status === PropertyStatus.DRAFT
        ? 'DRAFT'
        : status === PropertyStatus.ARCHIVED
          ? 'ARCHIVED'
          : 'ACTIVE';

    const result = await this.prisma.property.updateMany({
      where: { id: { in: propertyIds } },
      data: { status: validStatus },
    });

    return { updatedCount: result.count };
  }

  async bulkDeleteProperties(propertyIds: string[]): Promise<{
    deletedCount: number;
    propertyIds: string[];
  }> {
    const result = await this.prisma.property.deleteMany({
      where: { id: { in: propertyIds } },
    });

    return {
      deletedCount: result.count,
      propertyIds,
    };
  }

  async bulkExportProperties(
    propertyIds: string[],
    filter?: string,
  ): Promise<{ total: number; data: Record<string, any>[] }> {
    const propertyWhere: Record<string, unknown> = { id: { in: propertyIds } };

    if (filter) {
      propertyWhere.title = { contains: filter, mode: 'insensitive' as const };
    }

    const properties = await (this.prisma.property as any).findMany({
      where: propertyWhere,
      select: {
        id: true,
        title: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        price: true,
        propertyType: true,
        bedrooms: true,
        bathrooms: true,
        squareFeet: true,
        lotSize: true,
        yearBuilt: true,
        hoaName: true,
        hoaMonthlyFee: true,
        hoaAmenities: true,
        hoaContactInfo: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        ownerId: true,
        owner: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        agents: {
          include: {
            agent: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    const exportData: Record<string, any>[] = properties.map((prop: Record<string, any>) => ({
      id: prop.id,
      title: prop.title,
      address: prop.address,
      city: prop.city,
      state: prop.state,
      zipCode: prop.zipCode,
      price: Number(prop.price),
      propertyType: prop.propertyType,
      bedrooms: prop.bedrooms,
      bathrooms: prop.bathrooms,
      squareFeet: prop.squareFeet,
      lotSize: prop.lotSize,
      yearBuilt: prop.yearBuilt,
      hoaName: prop.hoaName,
      hoaMonthlyFee:
        prop.hoaMonthlyFee === null || prop.hoaMonthlyFee === undefined
          ? prop.hoaMonthlyFee
          : Number(prop.hoaMonthlyFee),
      hoaAmenities: prop.hoaAmenities,
      hoaContactInfo: prop.hoaContactInfo,
      status: prop.status,
      ownerId: prop.ownerId,
      ownerEmail: prop.owner.email,
      ownerName: `${prop.owner.firstName} ${prop.owner.lastName}`,
      ownerPhone: prop.owner.phone,
      agents: (prop.agents || []).map((pa: any) => ({
        agentId: pa.agentId,
        name: `${pa.agent.firstName} ${pa.agent.lastName}`,
        email: pa.contactEmail || pa.agent.email,
        phone: pa.contactPhone || pa.agent.phone,
        commissionRate: Number(pa.commissionRate),
      })),
      createdAt: prop.createdAt,
      updatedAt: prop.updatedAt,
    }));

    return {
      total: exportData.length,
      data: exportData,
    };
  }

  async assignAgent(propertyId: string, dto: AssignAgentDto, user: AuthUserPayload) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      throw new NotFoundException('Property not found');
    }

    if (user.role !== 'ADMIN' && property.ownerId !== user.sub) {
      throw new ForbiddenException('Only the property owner or an admin can assign agents');
    }

    const agent = await this.prisma.user.findUnique({
      where: { id: dto.agentId },
    });
    if (!agent) {
      throw new NotFoundException('Agent user not found');
    }
    if (agent.role !== 'AGENT') {
      throw new BadRequestException('Assigned user must have the AGENT role');
    }

    const existing = await this.prisma.propertyAgent.findUnique({
      where: {
        propertyId_agentId: {
          propertyId,
          agentId: dto.agentId,
        },
      },
    });
    if (existing) {
      throw new BadRequestException('Agent is already assigned to this property');
    }

    return this.prisma.propertyAgent.create({
      data: {
        propertyId,
        agentId: dto.agentId,
        commissionRate:
          dto.commissionRate !== undefined
            ? new Decimal(dto.commissionRate.toString())
            : new Decimal('0.03'),
        contactPhone: dto.contactPhone ?? null,
        contactEmail: dto.contactEmail ?? null,
      },
      include: {
        agent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });
  }

  async updateAgentAssignment(
    propertyId: string,
    agentId: string,
    dto: UpdateAgentAssignmentDto,
    user: AuthUserPayload,
  ) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      throw new NotFoundException('Property not found');
    }

    if (user.role !== 'ADMIN' && property.ownerId !== user.sub) {
      throw new ForbiddenException(
        'Only the property owner or an admin can update agent assignments',
      );
    }

    const assignment = await this.prisma.propertyAgent.findUnique({
      where: {
        propertyId_agentId: {
          propertyId,
          agentId,
        },
      },
    });
    if (!assignment) {
      throw new NotFoundException('Agent assignment not found for this property');
    }

    return this.prisma.propertyAgent.update({
      where: {
        propertyId_agentId: {
          propertyId,
          agentId,
        },
      },
      data: {
        commissionRate:
          dto.commissionRate !== undefined ? new Decimal(dto.commissionRate.toString()) : undefined,
        contactPhone: dto.contactPhone !== undefined ? dto.contactPhone : undefined,
        contactEmail: dto.contactEmail !== undefined ? dto.contactEmail : undefined,
      },
      include: {
        agent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });
  }

  async removeAgentAssignment(propertyId: string, agentId: string, user: AuthUserPayload) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      throw new NotFoundException('Property not found');
    }

    if (user.role !== 'ADMIN' && property.ownerId !== user.sub) {
      throw new ForbiddenException(
        'Only the property owner or an admin can remove agent assignments',
      );
    }

    const assignment = await this.prisma.propertyAgent.findUnique({
      where: {
        propertyId_agentId: {
          propertyId,
          agentId,
        },
      },
    });
    if (!assignment) {
      throw new NotFoundException('Agent assignment not found for this property');
    }

    return this.prisma.propertyAgent.delete({
      where: {
        propertyId_agentId: {
          propertyId,
          agentId,
        },
      },
    });
  }

  async getAgents(propertyId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const assignments = await this.prisma.propertyAgent.findMany({
      where: { propertyId },
      include: {
        agent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    return assignments.map((pa: any) => ({
      id: pa.id,
      propertyId: pa.propertyId,
      agentId: pa.agentId,
      commissionRate: Number(pa.commissionRate),
      contactPhone: pa.contactPhone || pa.agent.phone,
      contactEmail: pa.contactEmail || pa.agent.email,
      createdAt: pa.createdAt,
      updatedAt: pa.updatedAt,
      agent: pa.agent,
    }));
  }

  // ---- Amenity methods (#551) ----

  async addAmenity(propertyId: string, dto: CreateAmenityDto) {
    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) {
      throw new NotFoundException('Property not found');
    }
    return this.prisma.propertyAmenity.create({
      data: {
        propertyId,
        name: dto.name,
        amenityType: dto.amenityType,
        description: dto.description ?? null,
        isAvailable: dto.isAvailable ?? true,
      },
    });
  }

  async getAmenities(propertyId: string) {
    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) {
      throw new NotFoundException('Property not found');
    }
    return this.prisma.propertyAmenity.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateAmenity(propertyId: string, amenityId: string, dto: UpdateAmenityDto) {
    const amenity = await this.prisma.propertyAmenity.findUnique({
      where: { id: amenityId },
    });
    if (!amenity || amenity.propertyId !== propertyId) {
      throw new NotFoundException('Amenity not found for this property');
    }
    return this.prisma.propertyAmenity.update({
      where: { id: amenityId },
      data: {
        name: dto.name,
        amenityType: dto.amenityType,
        description: dto.description,
        isAvailable: dto.isAvailable,
      },
    });
  }

  async removeAmenity(propertyId: string, amenityId: string) {
    const amenity = await this.prisma.propertyAmenity.findUnique({
      where: { id: amenityId },
    });
    if (!amenity || amenity.propertyId !== propertyId) {
      throw new NotFoundException('Amenity not found for this property');
    }
    return this.prisma.propertyAmenity.delete({ where: { id: amenityId } });
  }
}
