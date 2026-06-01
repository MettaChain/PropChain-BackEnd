import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../database/prisma.service';
import { CreatePropertyDto, UpdatePropertyDto } from './dto/property.dto';
import { SearchPropertiesDto } from './dto/search-properties.dto';
import { FraudService } from '../fraud/fraud.service';
import { GeocodingService } from './geocoding.service';
import { PriceHistoryService } from '../price-history/price-history.service';
import { PropertyStatus, UserRole } from '../types/prisma.types';
import {
  canTransitionPropertyStatus,
  getAllowedNextPropertyStatuses,
} from './property-status.constants';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly fraudService: FraudService,
    private readonly geocodingService: GeocodingService,
    private readonly priceHistoryService: PriceHistoryService,
  ) {}

  async create(createPropertyDto: CreatePropertyDto, ownerId: string) {
    const { price, squareFeet, lotSize, latitude, longitude, ...rest } = createPropertyDto;

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
      const geo = await this.geocodingService.geocodeAddress({
        address: rest.address,
        city: rest.city,
        state: rest.state,
        zipCode: rest.zipCode,
        country: rest.country,
      });
      if (geo) {
        resolvedLat = resolvedLat ?? geo.latitude;
        resolvedLng = resolvedLng ?? geo.longitude;
      }
    }

    const property = await this.prisma.property.create({
      data: {
        ...rest,
        price: new Decimal(price.toString()),
        squareFeet: squareFeet ? new Decimal(squareFeet.toString()) : null,
        lotSize: lotSize ? new Decimal(lotSize.toString()) : null,
        status: PropertyStatus.DRAFT,
        latitude: resolvedLat,
        longitude: resolvedLng,
        owner: {
          connect: { id: ownerId },
        },
      },
    });

    await this.fraudService.evaluatePropertyCreated(property.id);

    return property;
  }

  async findAll(params?: FindAllParams) {
    const { skip, take, where, orderBy } = params || {};
    return this.prisma.property.findMany({
      skip,
      take,
      where,
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
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.property.findUnique({
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
      },
    });
  }

  async update(
    id: string,
    updatePropertyDto: UpdatePropertyDto,
    userId?: string,
    userRole?: UserRole,
  ) {
    const { price, squareFeet, lotSize, latitude, longitude, ...rest } = updatePropertyDto;

    // Get existing property to check if price is changing
    const existingProperty = await this.prisma.property.findUnique({
      where: { id },
      select: {
        price: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        country: true,
      },
    });

    if (!existingProperty) {
      throw new NotFoundException(`Property with ID ${id} not found`);
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
      const before = {
        address: existingProperty.address,
        city: existingProperty.city,
        state: existingProperty.state,
        zipCode: existingProperty.zipCode,
        country: existingProperty.country,
      };
      const after = {
        address: rest.address ?? existingProperty.address,
        city: rest.city ?? existingProperty.city,
        state: rest.state ?? existingProperty.state,
        zipCode: rest.zipCode ?? existingProperty.zipCode,
        country: existingProperty.country, // not in UpdatePropertyDto
      };

      if (this.geocodingService.hasAddressChanged(before, after)) {
        const geo = await this.geocodingService.geocodeAddress(after);
        if (geo) {
          resolvedLat = geo.latitude;
          resolvedLng = geo.longitude;
        }
      }
    }

    // Record price change if price is being updated
    if (price !== undefined && price !== null) {
      const newPrice = new Decimal(price.toString());
      const previousPrice = existingProperty.price;

      // Only record if price actually changed
      if (!newPrice.equals(previousPrice)) {
        if (userId && userRole) {
          try {
            await this.priceHistoryService.recordPriceChange(
              id,
              previousPrice,
              newPrice,
              userId,
              userRole,
              'Property price updated',
              { source: 'property_update' },
            );
          } catch (error) {
            // Log error but don't fail the property update
            console.error(`Failed to record price change for property ${id}:`, error);
          }
        }
      }
    }

    return this.prisma.property.update({
      where: { id },
      data: {
        ...rest,
        price: price ? new Decimal(price.toString()) : undefined,
        squareFeet: squareFeet ? new Decimal(squareFeet.toString()) : undefined,
        lotSize: lotSize ? new Decimal(lotSize.toString()) : undefined,
        latitude: resolvedLat,
        longitude: resolvedLng,
      },
    });
  }

  async remove(id: string) {
    return this.prisma.property.delete({
      where: { id },
    });
  }

  async findByOwnerId(ownerId: string) {
    return this.prisma.property.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
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
    const isPrivileged =
      actorRole === UserRole.ADMIN || actorRole === UserRole.AGENT;
    if (!isOwner && !isPrivileged) {
      throw new ForbiddenException(
        'You are not allowed to change the status of this property',
      );
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
   */
  async searchProperties(dto: SearchPropertiesDto): Promise<PaginatedPropertiesResult> {
    const where = this.buildSearchWhereClause(dto);

    const page = dto.page && dto.page > 0 ? dto.page : 1;
    const limit = dto.limit && dto.limit > 0 ? dto.limit : 20;
    const skip = (page - 1) * limit;
    const sortBy = dto.sortBy ?? 'createdAt';
    const sortOrder = dto.sortOrder ?? 'desc';

    const [items, total] = await this.prisma.$transaction([
      this.prisma.property.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          owner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.property.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
    };
  }

  /**
   * Build a Prisma `where` clause from a SearchPropertiesDto.
   * Exposed as private and used only by `searchProperties`.
   */
  private buildSearchWhereClause(dto: SearchPropertiesDto): Record<string, unknown> {
    const where: Record<string, unknown> = {};

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

// Optional status filter
    if (dto.status) {
      where.status = dto.status;
    }

    return where;
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

    const properties = await this.prisma.property.findMany({
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
      status: prop.status,
      ownerId: prop.ownerId,
      ownerEmail: prop.owner.email,
      ownerName: `${prop.owner.firstName} ${prop.owner.lastName}`,
      ownerPhone: prop.owner.phone,
      createdAt: prop.createdAt,
      updatedAt: prop.updatedAt,
    }));

    return {
      total: exportData.length,
      data: exportData,
    };
  }
}
