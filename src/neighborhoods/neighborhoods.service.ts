// @ts-nocheck

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  AmenityDto,
  CreateNeighborhoodDto,
  ListNeighborhoodsQueryDto,
  SchoolDto,
  UpdateNeighborhoodDto,
} from './dto/neighborhood.dto';

@Injectable()
export class NeighborhoodsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create a neighborhood, optionally with embedded schools and amenities. */
  async create(dto: CreateNeighborhoodDto) {
    const { schools, amenities, ...rest } = dto;

    return this.prisma.neighborhood.create({
      data: {
        ...rest,
        schools: schools && schools.length > 0 ? { create: schools } : undefined,
        amenities: amenities && amenities.length > 0 ? { create: amenities } : undefined,
      } as any,
      include: { schools: true, amenities: true },
    });
  }

  /** Full neighborhood detail with schools, amenities, and property count. */
  async findOne(id: string) {
    const neighborhood = await this.prisma.neighborhood.findUnique({
      where: { id },
      include: {
        schools: { orderBy: { rating: 'desc' } },
        amenities: { orderBy: { distanceMiles: 'asc' } },
        _count: { select: { properties: true } },
      },
    });

    if (!neighborhood) {
      throw new NotFoundException(`Neighborhood ${id} not found`);
    }
    return neighborhood;
  }

  async list(query: ListNeighborhoodsQueryDto) {
    const skip = query.skip ?? 0;
    const take = query.take ?? 20;
    const where = {
      ...(query.city ? { city: query.city } : {}),
      ...(query.state ? { state: query.state } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.neighborhood.findMany({
        where,
        skip,
        take,
        orderBy: [{ state: 'asc' }, { city: 'asc' }, { name: 'asc' }],
        include: {
          _count: { select: { schools: true, amenities: true, properties: true } },
        },
      }),
      this.prisma.neighborhood.count({ where }),
    ]);

    return { items, total, skip, take };
  }

  async update(id: string, dto: UpdateNeighborhoodDto) {
    await this.assertExists(id);
    return this.prisma.neighborhood.update({
      where: { id },
      data: dto as any,
      include: { schools: true, amenities: true },
    });
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.prisma.neighborhood.delete({ where: { id } });
    return { success: true };
  }

  // ---------- Schools ----------

  async addSchool(neighborhoodId: string, dto: SchoolDto) {
    await this.assertExists(neighborhoodId);
    return this.prisma.neighborhoodSchool.create({
      data: { ...dto, neighborhoodId },
    });
  }

  async removeSchool(neighborhoodId: string, schoolId: string) {
    const result = await this.prisma.neighborhoodSchool.deleteMany({
      where: { id: schoolId, neighborhoodId },
    });
    if (result.count === 0) {
      throw new NotFoundException('School not found in this neighborhood');
    }
    return { success: true };
  }

  async listSchools(neighborhoodId: string) {
    await this.assertExists(neighborhoodId);
    return this.prisma.neighborhoodSchool.findMany({
      where: { neighborhoodId },
      orderBy: { rating: 'desc' },
    });
  }

  // ---------- Amenities ----------

  async addAmenity(neighborhoodId: string, dto: AmenityDto) {
    await this.assertExists(neighborhoodId);
    return this.prisma.neighborhoodAmenity.create({
      data: { ...dto, neighborhoodId },
    });
  }

  async removeAmenity(neighborhoodId: string, amenityId: string) {
    const result = await this.prisma.neighborhoodAmenity.deleteMany({
      where: { id: amenityId, neighborhoodId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Amenity not found in this neighborhood');
    }
    return { success: true };
  }

  async listAmenities(neighborhoodId: string, category?: string) {
    await this.assertExists(neighborhoodId);
    return this.prisma.neighborhoodAmenity.findMany({
      where: { neighborhoodId, ...(category ? { category } : {}) },
      orderBy: [{ category: 'asc' }, { distanceMiles: 'asc' }],
    });
  }

  // ---------- Property linkage ----------

  /** Resolve and return neighborhood data for a given property. */
  async getForProperty(propertyId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, neighborhoodId: true },
    });

    if (!property) {
      throw new NotFoundException(`Property ${propertyId} not found`);
    }
    if (!property.neighborhoodId) {
      return null;
    }
    return this.findOne(property.neighborhoodId);
  }

  async linkProperty(propertyId: string, neighborhoodId: string) {
    await this.assertExists(neighborhoodId);
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });
    if (!property) {
      throw new NotFoundException(`Property ${propertyId} not found`);
    }
    return this.prisma.property.update({
      where: { id: propertyId },
      data: { neighborhoodId },
      select: { id: true, neighborhoodId: true },
    });
  }

  async unlinkProperty(propertyId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });
    if (!property) {
      throw new NotFoundException(`Property ${propertyId} not found`);
    }
    return this.prisma.property.update({
      where: { id: propertyId },
      data: { neighborhoodId: null },
      select: { id: true, neighborhoodId: true },
    });
  }

  // ---------- Neighborhood Scoring (#935) ----------

  private readonly defaultWeights = {
    walkScore: 0.25,
    transitScore: 0.2,
    bikeScore: 0.1,
    crimeIndex: 0.25,
    schoolRating: 0.2,
  };

  async calculateCompositeScore(
    neighborhoodId: string,
    weights?: Record<string, number>,
  ): Promise<{ score: number; breakdown: Record<string, number | null> }> {
    const neighborhood = await this.prisma.neighborhood.findUnique({
      where: { id: neighborhoodId },
      select: {
        walkScore: true,
        transitScore: true,
        bikeScore: true,
        crimeIndex: true,
        schoolRating: true,
        metadata: true,
      },
    });

    if (!neighborhood) {
      throw new NotFoundException(`Neighborhood ${neighborhoodId} not found`);
    }

    const w = { ...this.defaultWeights, ...weights };
    const totalWeight = Object.values(w).reduce((s, v) => s + v, 0);
    const normalized = totalWeight > 0 ? totalWeight : 1;

    const normalizedWeights = {
      walkScore: w.walkScore / normalized,
      transitScore: w.transitScore / normalized,
      bikeScore: w.bikeScore / normalized,
      crimeIndex: w.crimeIndex / normalized,
      schoolRating: w.schoolRating / normalized,
    };

    const breakdown: Record<string, number | null> = {
      walkScore: neighborhood.walkScore,
      transitScore: neighborhood.transitScore,
      bikeScore: neighborhood.bikeScore,
      crimeIndex: neighborhood.crimeIndex,
      schoolRating: neighborhood.schoolRating,
    };

    let score = 0;
    if (neighborhood.walkScore != null) {
      score += neighborhood.walkScore * normalizedWeights.walkScore;
    }
    if (neighborhood.transitScore != null) {
      score += neighborhood.transitScore * normalizedWeights.transitScore;
    }
    if (neighborhood.bikeScore != null) {
      score += neighborhood.bikeScore * normalizedWeights.bikeScore;
    }
    if (neighborhood.crimeIndex != null) {
      score += (100 - neighborhood.crimeIndex) * normalizedWeights.crimeIndex;
    }
    if (neighborhood.schoolRating != null) {
      score += (neighborhood.schoolRating / 10) * 100 * normalizedWeights.schoolRating;
    }

    const finalScore = Math.round(Math.min(100, Math.max(1, score)));

    const existingMetadata = (neighborhood.metadata as Record<string, any>) || {};
    const scoreHistory = Array.isArray(existingMetadata.scoreHistory)
      ? existingMetadata.scoreHistory
      : [];
    scoreHistory.push({
      score: finalScore,
      weights: normalizedWeights,
      breakdown,
      calculatedAt: new Date().toISOString(),
    });

    await this.prisma.neighborhood.update({
      where: { id: neighborhoodId },
      data: {
        metadata: {
          ...existingMetadata,
          scoreHistory,
        },
      } as any,
    });

    return { score: finalScore, breakdown };
  }

  async getScoreHistory(neighborhoodId: string): Promise<any[]> {
    await this.assertExists(neighborhoodId);
    const neighborhood = await this.prisma.neighborhood.findUnique({
      where: { id: neighborhoodId },
      select: { metadata: true },
    });
    const metadata = (neighborhood!.metadata as Record<string, any>) || {};
    return Array.isArray(metadata.scoreHistory) ? metadata.scoreHistory : [];
  }

  async rankNeighborhoods(
    city: string,
    weights?: Record<string, number>,
  ): Promise<Array<{ rank: number; neighborhoodId: string; name: string; score: number }>> {
    const neighborhoods = await this.prisma.neighborhood.findMany({
      where: { city },
      select: { id: true, name: true },
    });

    const scored: Array<{ rank: number; neighborhoodId: string; name: string; score: number }> = [];

    for (const n of neighborhoods) {
      const { score } = await this.calculateCompositeScore(n.id, weights);
      scored.push({ rank: 0, neighborhoodId: n.id, name: n.name, score });
    }

    scored.sort((a, b) => b.score - a.score);
    scored.forEach((item, idx) => {
      item.rank = idx + 1;
    });

    return scored;
  }

  private async assertExists(id: string) {
    const found = await this.prisma.neighborhood.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException(`Neighborhood ${id} not found`);
    }
  }
}
