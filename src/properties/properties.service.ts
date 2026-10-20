import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
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
import { PropertiesListingsCacheService } from './properties-listings-cache.service';
import { PropertiesCacheService } from './properties-cache.service';
import {
  canTransitionPropertyStatus,
  getAllowedNextPropertyStatuses,
  DEFAULT_PROPERTY_STATUS,
} from './property-status.constants';
import { propertiesTotal } from '../metrics/metrics.controller';

interface FindAllParams {
  skip?: number;
  take?: number;
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
}

/**
 * How many filters a search actually carried. Logged so a slow or empty search
 * can be attributed to a specific query shape without logging the values
 * themselves, which would put addresses and owner data into the log stream.
 * Paging and sorting are excluded: they are not filters and `page`/`limit` are
 * always present because the DTO defaults them.
 */
const NON_FILTER_SEARCH_FIELDS = new Set(['page', 'limit', 'sortBy', 'sortOrder']);

function countSearchFilters(dto: SearchPropertiesDto): number {
  const entries = Object.entries((dto ?? {}) as Record<string, unknown>);
  return entries.filter(
    ([key, value]) => !NON_FILTER_SEARCH_FIELDS.has(key) && value !== undefined && value !== null,
  ).length;
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
    @Optional() private readonly listingsCache?: PropertiesListingsCacheService,
    @Optional() private readonly propertiesCache?: PropertiesCacheService,
  ) {}

  /**
   * Drop the cached detail view of a property. Best-effort: a cache failure is
   * logged and ignored, because the entry also expires on its own within the TTL.
   */
  private async invalidateCachedProperty(propertyId: string): Promise<void> {
    if (!this.propertiesCache) return;
    try {
      await this.propertiesCache.invalidateProperty(propertyId);
    } catch (err) {
      this.logger.warn('Property detail cache invalidation failed', {
        event: 'properties.detail_cache_invalidation_failed',
        propertyId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

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

    const geo = await this.geocodingService.geocodeAddress(addressFields);
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
    await this.invalidateCachedProperty(property.id);

    return property;
  }

  async findAll(params?: FindAllParams) {
    const { skip, take, where, orderBy } = params || {};
    return (this.prisma.property as any).findMany({
      skip,
      take,
      where: this.buildListingWhere(where),
      // Without an explicit sort the database returned rows in arbitrary order, so
      // `skip`/`take` paging could repeat or skip a property between calls. Default
      // to newest first with `id` as a tie-breaker to make paging stable.
      orderBy: orderBy ?? { createdAt: 'desc' as const, id: 'desc' as const },
      include: this.listingRelations,
    });
  }

  /**
   * `GET /properties` with paging. Returns the rows and the total that matches
   * the same filter, so a client can render "page 2 of 7" without a second
   * request. `findAll` is left as-is for callers that just want the rows.
   */
  async findAllPaginated(
    page: number,
    limit: number,
    params?: Omit<FindAllParams, 'skip' | 'take'>,
  ): Promise<{ items: unknown[]; total: number }> {
    const where = this.buildListingWhere(params?.where);
    const skip = (page - 1) * limit;

    const [items, total] = await this.prisma.$transaction([
      (this.prisma.property as any).findMany({
        skip,
        take: limit,
        where,
        orderBy: params?.orderBy ?? { createdAt: 'desc' as const, id: 'desc' as const },
        include: this.listingRelations,
      }),
      this.prisma.property.count({ where }),
    ]);

    return { items, total };
  }

  /** The public listing filter: never soft-deleted, and ACTIVE unless overridden. */
  private buildListingWhere(where?: Record<string, unknown>): Record<string, unknown> {
    return where
      ? { ...where, status: where.status ?? PropertyStatus.ACTIVE, deleted: false }
      : { status: PropertyStatus.ACTIVE, deleted: false };
  }

  /** Owner and assigned-agent payload shared by every listing read. */
  private get listingRelations() {
    return {
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
    };
  }

  async findOne(id: string) {
    const load = () =>
      (this.prisma.property as any).findUnique({
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

    // Served from Redis when the module is wired with PropertiesCacheService.
    if (!this.propertiesCache) return load();
    return this.propertiesCache.rememberExistingProperty(id, load);
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
    await this.invalidateCachedProperty(id);
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
    await this.invalidateCachedProperty(id);
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
    await this.invalidateCachedProperty(id);
    this.logger.log('Property restored', { event: 'properties.restored', propertyId: id, userId: user.sub });
    return updated;
  }

  async findByOwnerId(ownerId: string) {
    return this.prisma.property.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc', id: 'desc' },
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

    if (result.count > 0) {
      this.logger.log('Expired properties', {
        event: 'properties.expired',
        updatedCount: result.count,
      });
    }

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
      this.logger.log('Property status unchanged', {
        event: 'properties.status_transition_noop',
        propertyId,
        status: nextStatus,
        actorId,
      });
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

    this.logger.log('Property status changed', {
      event: 'properties.status_transitioned',
      propertyId,
      from: currentStatus,
      to: nextStatus,
      actorId,
    });
    // Drop the cached detail view first: the read below would otherwise serve the
    // pre-transition status.
    await this.invalidateCachedProperty(propertyId);

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
    // Served from Redis when the module is wired with PropertiesListingsCacheService.
    if (this.listingsCache) {
      return this.listingsCache.rememberSearch(dto, () => this.runSearch(dto));
    }
    return this.runSearch(dto);
  }

  /** The search query itself, uncached. */
  private async runSearch(dto: SearchPropertiesDto): Promise<PaginatedPropertiesResult> {
    const where = this.buildSearchWhereClause(dto);
    const page = dto.page && dto.page > 0 ? dto.page : 1;
    const limit = dto.limit && dto.limit > 0 ? dto.limit : 20;
    const sort = { field: dto.sortBy ?? 'createdAt', order: dto.sortOrder ?? 'desc' } as {
      field: string;
      order: 'asc' | 'desc';
    };

    return this.hasTrustScoreFilter(dto)
      ? this.searchByTrustScore(dto, where, page, limit, sort)
      : this.searchByPaging(dto, where, page, limit, sort);
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
    const items = filtered.slice(skip, skip + limit);

    this.logger.log('Property search completed', {
      event: 'properties.search',
      page,
      limit,
      total: filtered.length,
      returned: items.length,
      filters: countSearchFilters(dto),
      trustScoreFiltered: true,
    });

    return this.buildPage(items, filtered.length, page, limit);
  }

  /** The common case: page and count in one transaction so they cannot disagree. */
  private async searchByPaging(
    dto: SearchPropertiesDto,
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

    const items = this.annotateTrustScore(rawItems as any[]);

    this.logger.log('Property search completed', {
      event: 'properties.search',
      page,
      limit,
      total,
      returned: items.length,
      filters: countSearchFilters(dto),
      trustScoreFiltered: false,
    });

    return this.buildPage(items, total, page, limit);
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

  /**
   * Build a Prisma `where` clause from a SearchPropertiesDto.
   * Exposed as private and used only by `searchProperties`.
   */
  private buildSearchWhereClause(dto: SearchPropertiesDto): Record<string, unknown> {
    const where: Record<string, unknown> = {
      deleted: false,
    };

    // Price range
    if (dto.minPrice !== undefined || dto.maxPrice !== undefined) {
      const priceFilter: Record<string, Decimal> = {};
      if (dto.minPrice !== undefined) {
        priceFilter.gte = new Decimal(dto.minPrice.toString());
      }
      if (dto.maxPrice !== undefined) {
        priceFilter.lte = new Decimal(dto.maxPrice.toString());
      }
      where.price = priceFilter;
    }

    // Location: granular fields (case-insensitive equality)
    if (dto.city) {
      where.city = { equals: dto.city, mode: 'insensitive' };
    }
    if (dto.state) {
      where.state = { equals: dto.state, mode: 'insensitive' };
    }
    if (dto.zipCode) {
      where.zipCode = dto.zipCode;
    }
    if (dto.country) {
      where.country = { equals: dto.country, mode: 'insensitive' };
    }

    // Location: free-text fallback (matches across address/city/state/zipCode)
    if (dto.location) {
      where.OR = [
        { address: { contains: dto.location, mode: 'insensitive' } },
        { city: { contains: dto.location, mode: 'insensitive' } },
        { state: { contains: dto.location, mode: 'insensitive' } },
        { zipCode: { contains: dto.location, mode: 'insensitive' } },
      ];
    }

    // Property type (case-insensitive)
    if (dto.propertyType) {
      where.propertyType = { equals: dto.propertyType, mode: 'insensitive' };
    }

    // Bedrooms: exact takes precedence over range
    if (dto.bedrooms !== undefined) {
      where.bedrooms = dto.bedrooms;
    } else if (dto.minBedrooms !== undefined || dto.maxBedrooms !== undefined) {
      const bedroomsFilter: Record<string, number> = {};
      if (dto.minBedrooms !== undefined) bedroomsFilter.gte = dto.minBedrooms;
      if (dto.maxBedrooms !== undefined) bedroomsFilter.lte = dto.maxBedrooms;
      where.bedrooms = bedroomsFilter;
    }

    // Bathrooms: stored as Decimal — wrap accordingly
    if (dto.bathrooms !== undefined) {
      where.bathrooms = new Decimal(dto.bathrooms.toString());
    } else if (dto.minBathrooms !== undefined || dto.maxBathrooms !== undefined) {
      const bathroomsFilter: Record<string, Decimal> = {};
      if (dto.minBathrooms !== undefined) {
        bathroomsFilter.gte = new Decimal(dto.minBathrooms.toString());
      }
      if (dto.maxBathrooms !== undefined) {
        bathroomsFilter.lte = new Decimal(dto.maxBathrooms.toString());
      }
      where.bathrooms = bathroomsFilter;
    }

    // Public search only exposes approved listings.
    // Any search from the public search endpoint must end up returning ACTIVE properties.
    where.status = PropertyStatus.ACTIVE;

    // Year built filter (#555)
    if (dto.minYearBuilt !== undefined || dto.maxYearBuilt !== undefined) {
      const yearFilter: Record<string, number> = {};
      if (dto.minYearBuilt !== undefined) yearFilter.gte = dto.minYearBuilt;
      if (dto.maxYearBuilt !== undefined) yearFilter.lte = dto.maxYearBuilt;
      where.yearBuilt = yearFilter;
    }

    // Metadata: category and tag
    if (dto.category) {
      where.category = { equals: dto.category, mode: 'insensitive' };
    }
    if (dto.tag) {
      where.tags = { has: dto.tag };
    }

    // Amenity type filter (via relation)
    if (dto.amenityType) {
      where.amenities = {
        some: { amenityType: { equals: dto.amenityType, mode: 'insensitive' } },
      };
    }

    // Geo: validate lat/lng usage
    const hasLat = dto.lat !== undefined;
    const hasLng = dto.lng !== undefined;
    if (hasLat !== hasLng) {
      throw new BadRequestException('Both lat and lng must be provided together');
    }

    const lat = dto.lat;
    const lng = dto.lng;
    if (lat === undefined || lng === undefined) {
      throw new BadRequestException('Both lat and lng must be provided together');
    }

    const hasBoundingBox =
      dto.minLat !== undefined ||
      dto.maxLat !== undefined ||
      dto.minLng !== undefined ||
      dto.maxLng !== undefined;

    if (lat !== undefined && lng !== undefined) {
      if (dto.radiusKm !== undefined) {
        // Approximate radius as bounding box (1 degree lat ≈ 111km)
        const latDelta = dto.radiusKm / 111;
        const lngDelta = dto.radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
        where.latitude = { gte: lat - latDelta, lte: lat + latDelta };
        where.longitude = { gte: lng - lngDelta, lte: lng + lngDelta };
      } else if (!hasBoundingBox) {
        throw new BadRequestException(
          'When providing lat/lng, either radiusKm or bounding box params (minLat/maxLat/minLng/maxLng) must also be provided',
        );
      }
    }

    // Bounding box filter
    if (hasBoundingBox) {
      const latFilter: Record<string, number> = {};
      const lngFilter: Record<string, number> = {};
      if (dto.minLat !== undefined) latFilter.gte = dto.minLat;
      if (dto.maxLat !== undefined) latFilter.lte = dto.maxLat;
      if (dto.minLng !== undefined) lngFilter.gte = dto.minLng;
      if (dto.maxLng !== undefined) lngFilter.lte = dto.maxLng;
      if (Object.keys(latFilter).length > 0) {
        where.latitude = {
          ...(where.latitude as Record<string, number> | undefined),
          ...latFilter,
        };
      }
      if (Object.keys(lngFilter).length > 0) {
        where.longitude = {
          ...(where.longitude as Record<string, number> | undefined),
          ...lngFilter,
        };
      }
    }

    return where;
  }

  async approveProperty(propertyId: string, actorId: string) {
    const property = await this.transitionStatus(
      propertyId,
      PropertyStatus.ACTIVE,
      actorId,
      UserRole.ADMIN,
    );
    this.logger.log('Property approved', {
      event: 'properties.approved',
      propertyId,
      actorId,
    });
    return property;
  }

  async rejectProperty(propertyId: string, actorId: string) {
    const property = await this.transitionStatus(
      propertyId,
      PropertyStatus.ARCHIVED,
      actorId,
      UserRole.ADMIN,
    );
    this.logger.log('Property rejected', {
      event: 'properties.rejected',
      propertyId,
      actorId,
    });
    return property;
  }

  /** Statuses a bulk update is allowed to set. Anything else is rejected outright. */
  private static readonly BULK_STATUSES: PropertyStatus[] = [
    PropertyStatus.DRAFT,
    PropertyStatus.ACTIVE,
    PropertyStatus.ARCHIVED,
  ];

  async bulkUpdatePropertyStatus(
    propertyIds: string[],
    status: PropertyStatus,
  ): Promise<{ updatedCount: number }> {
    if (!propertyIds?.length) {
      throw new BadRequestException('At least one property id is required');
    }

    // Previously any status that was not DRAFT or ARCHIVED was silently coerced
    // to ACTIVE, so asking for SOLD quietly marked every listing ACTIVE. An
    // unsupported status is now reported instead of applied.
    if (!PropertiesService.BULK_STATUSES.includes(status)) {
      throw new BadRequestException(
        `Bulk status update only supports ${PropertiesService.BULK_STATUSES.join(', ')}`,
      );
    }

    const result = await this.prisma.property.updateMany({
      where: { id: { in: propertyIds } },
      data: { status },
    });

    this.logger.log('Bulk property status update', {
      event: 'properties.bulk_status_updated',
      requestedCount: propertyIds.length,
      updatedCount: result.count,
      status,
    });

    return { updatedCount: result.count };
  }

  async bulkDeleteProperties(propertyIds: string[]): Promise<{
    deletedCount: number;
    propertyIds: string[];
  }> {
    if (!propertyIds?.length) {
      throw new BadRequestException('At least one property id is required');
    }

    // Resolve the ids that actually exist first. Echoing the requested ids back
    // told the caller everything had been deleted even when some ids matched
    // nothing.
    const existing = (await this.prisma.property.findMany({
      where: { id: { in: propertyIds } },
      select: { id: true },
    })) as unknown as { id: string }[];

    const foundIds = existing.map((p) => p.id);
    if (foundIds.length === 0) {
      this.logger.warn('Bulk property delete matched nothing', {
        event: 'properties.bulk_delete_no_match',
        requestedCount: propertyIds.length,
      });
      return { deletedCount: 0, propertyIds: [] };
    }

    let result: { count: number };
    try {
      result = await this.prisma.property.deleteMany({ where: { id: { in: foundIds } } });
    } catch (err) {
      // A listing referenced by a transaction, document or commission cannot be
      // removed. That is a client-correctable conflict, not a server fault, and
      // the raw Prisma error must not reach the client.
      const code = (err as { code?: string })?.code;
      if (code === 'P2003' || code === 'P2014') {
        this.logger.warn('Bulk property delete blocked by a foreign key', {
          event: 'properties.bulk_delete_conflict',
          requestedCount: foundIds.length,
          error: err instanceof Error ? err.message : String(err),
        });
        throw new ConflictException(
          'One or more properties are referenced by transactions or documents and cannot be deleted',
        );
      }
      throw err;
    }

    this.logger.warn('Bulk properties deleted', {
      event: 'properties.bulk_deleted',
      requestedCount: propertyIds.length,
      deletedCount: result.count,
      actor: 'admin',
    });

    return {
      deletedCount: result.count,
      propertyIds: foundIds,
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

    this.logger.log('Bulk property export', {
      event: 'properties.bulk_exported',
      requestedCount: propertyIds.length,
      matchedCount: properties.length,
      filtered: Boolean(filter),
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

    await this.invalidateCachedProperty(propertyId);

    const assignment = await this.prisma.propertyAgent.create({
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

    this.logger.log('Agent assigned to property', {
      event: 'properties.agent_assigned',
      propertyId,
      agentId: dto.agentId,
      actorId: user.sub,
    });

    return assignment;
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

    await this.invalidateCachedProperty(propertyId);

    const updatedAssignment = await this.prisma.propertyAgent.update({
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

    this.logger.log('Agent assignment updated', {
      event: 'properties.agent_assignment_updated',
      propertyId,
      agentId,
      actorId: user.sub,
    });

    return updatedAssignment;
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

    await this.invalidateCachedProperty(propertyId);

    const removed = await this.prisma.propertyAgent.delete({
      where: {
        propertyId_agentId: {
          propertyId,
          agentId,
        },
      },
    });

    this.logger.log('Agent removed from property', {
      event: 'properties.agent_assignment_removed',
      propertyId,
      agentId,
      actorId: user.sub,
    });

    return removed;
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
    await this.invalidateCachedProperty(propertyId);

    const amenity = await this.prisma.propertyAmenity.create({
      data: {
        propertyId,
        name: dto.name,
        amenityType: dto.amenityType,
        description: dto.description ?? null,
        isAvailable: dto.isAvailable ?? true,
      },
    });

    this.logger.log('Amenity added to property', {
      event: 'properties.amenity_added',
      propertyId,
      amenityId: amenity.id,
      amenityType: dto.amenityType,
    });

    return amenity;
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
    await this.invalidateCachedProperty(propertyId);

    const updatedAmenity = await this.prisma.propertyAmenity.update({
      where: { id: amenityId },
      data: {
        name: dto.name,
        amenityType: dto.amenityType,
        description: dto.description,
        isAvailable: dto.isAvailable,
      },
    });

    this.logger.log('Property amenity updated', {
      event: 'properties.amenity_updated',
      propertyId,
      amenityId,
    });

    return updatedAmenity;
  }

  async removeAmenity(propertyId: string, amenityId: string) {
    const amenity = await this.prisma.propertyAmenity.findUnique({
      where: { id: amenityId },
    });
    if (!amenity || amenity.propertyId !== propertyId) {
      throw new NotFoundException('Amenity not found for this property');
    }
    await this.invalidateCachedProperty(propertyId);

    const removed = await this.prisma.propertyAmenity.delete({ where: { id: amenityId } });

    this.logger.log('Amenity removed from property', {
      event: 'properties.amenity_removed',
      propertyId,
      amenityId,
    });

    return removed;
  }
}
