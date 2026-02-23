import { Injectable } from '@nestjs/common';
import { Prisma, PropertyStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { PropertySearchDto } from '../dto/property-search.dto';
import { SearchAnalyticsService } from './search-analytics.service';

@Injectable()
export class PropertySearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: SearchAnalyticsService,
  ) {}
  async search(dto: PropertySearchDto, userId?: string) {
    const {
      latitude,
      longitude,
      radiusKm = 5,
      page = 1,
      limit = 10,
      minPrice,
      maxPrice,
      location,
      status = PropertyStatus.PUBLISHED,
    } = dto;

    const offset = (page - 1) * limit;

    // Geospatial search
    if (latitude && longitude) {
      return this.prisma.$queryRawUnsafe(`
        SELECT *,
          ST_Distance(
            coordinates,
            ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
          ) AS distance
        FROM properties
        WHERE status = '${status}'
        ${minPrice ? `AND price >= ${minPrice}` : ''}
        ${maxPrice ? `AND price <= ${maxPrice}` : ''}
        ${location ? `AND location ILIKE '%${location}%'` : ''}
        AND ST_DWithin(
          coordinates,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326),
          ${radiusKm * 1000}
        )
        ORDER BY distance ASC
        LIMIT ${limit}
        OFFSET ${offset};
      `);
    }

    // Normal search
    return this.prisma.property.findMany({
      where: {
        status,
        ...(location && { location: { contains: location, mode: 'insensitive' } }),
        ...(minPrice && { price: { gte: minPrice } }),
        ...(maxPrice && { price: { lte: maxPrice } }),
      },
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  private async geoSearch(dto: PropertySearchDto) {
    const {
      latitude,
      longitude,
      radiusKm = 5,
      page = 1,
      limit = 10,
      minPrice,
      maxPrice,
      location,
      status = PropertyStatus.PUBLISHED,
    } = dto;

    const offset = (page - 1) * limit;

    return this.prisma.$queryRawUnsafe(`
    SELECT *,
      ST_Distance(
        coordinates,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
      ) AS distance
    FROM properties
    WHERE status = '${status}'
    ${minPrice ? `AND price >= ${minPrice}` : ''}
    ${maxPrice ? `AND price <= ${maxPrice}` : ''}
    ${location ? `AND location ILIKE '%${location}%'` : ''}
    AND ST_DWithin(
      coordinates,
      ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326),
      ${radiusKm * 1000}
    )
    ORDER BY distance ASC
    LIMIT ${limit}
    OFFSET ${offset};
  `);
  }

  private async normalSearch(dto: PropertySearchDto) {
    const { page = 1, limit = 10, minPrice, maxPrice, location, status = PropertyStatus.PUBLISHED } = dto;

    const offset = (page - 1) * limit;

    return this.prisma.property.findMany({
      where: {
        status,
        ...(location && { location: { contains: location, mode: 'insensitive' } }),
        ...(minPrice && { price: { gte: minPrice } }),
        ...(maxPrice && { price: { lte: maxPrice } }),
      },
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }
}
