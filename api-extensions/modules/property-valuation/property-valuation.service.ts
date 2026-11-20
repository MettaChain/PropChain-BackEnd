import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../../src/database/prisma.service';
import {
  ComparableSaleDto,
  ValuationMetadataDto,
  ValuationResponseDto,
} from '../../dto/property-valuation.dto';

export interface PropertyValuationSource {
  id: string;
  address: string;
  price: unknown;
  taxAssessmentValue: unknown;
  priceHistory: Array<{ oldPrice: unknown; newPrice: unknown; createdAt: Date }>;
}

@Injectable()
export class PropertyValuationService {
  private readonly cache = new Map<string, ValuationResponseDto>();

  constructor(private readonly prisma: PrismaService) {}

  async getValuation(
    propertyId: string,
    comparables?: ComparableSaleDto[],
  ): Promise<ValuationResponseDto> {
    if (!isUUID(propertyId)) {
      throw new BadRequestException('Invalid property ID');
    }

    const cacheKey = `${propertyId}:${JSON.stringify(comparables ?? [])}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const property = (await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        address: true,
        price: true,
        taxAssessmentValue: true,
        priceHistory: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { oldPrice: true, newPrice: true, createdAt: true },
        },
      },
    })) as PropertyValuationSource | null;

    if (!property) {
      throw new NotFoundException(`Property ${propertyId} not found`);
    }

    const selectedComparables = comparables?.length
      ? comparables
      : this.comparablesFromHistory(property);
    const valuation = this.buildValuation(property, selectedComparables);
    this.cache.set(cacheKey, valuation);
    return valuation;
  }

  clearCache(propertyId?: string): void {
    if (!propertyId) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${propertyId}:`)) this.cache.delete(key);
    }
  }

  private comparablesFromHistory(property: PropertyValuationSource): ComparableSaleDto[] {
    const fromHistory = property.priceHistory.map((entry, index) => ({
      address: property.address,
      salePrice: Number(entry.newPrice),
      saleDate: entry.createdAt,
      distance: 0.25 + index * 0.25,
      similarityScore: Math.max(40, 90 - index * 10),
    }));
    if (fromHistory.length > 0) return fromHistory;

    const assessedValue = Number(property.taxAssessmentValue);
    if (Number.isFinite(assessedValue) && assessedValue > 0) {
      return [
        {
          address: property.address,
          salePrice: assessedValue,
          saleDate: new Date(),
          distance: 0.5,
          similarityScore: 70,
        },
      ];
    }
    return [];
  }

  private buildValuation(
    property: PropertyValuationSource,
    comparables: ComparableSaleDto[],
  ): ValuationResponseDto {
    if (comparables.length === 0) {
      return {
        propertyId: property.id,
        estimatedValue: Number(property.price),
        confidence: 20,
        comparableCount: 0,
        comparables: [],
        valuationDate: new Date(),
        metadata: {
          method: 'listing-price',
          source: 'api-extensions/property-valuation',
        },
      };
    }

    let weightedTotal = 0;
    let totalWeight = 0;
    let similarityTotal = 0;
    let maxDistance = 0;
    for (const comparable of comparables) {
      const weight = comparable.similarityScore / (1 + comparable.distance);
      weightedTotal += comparable.salePrice * weight;
      totalWeight += weight;
      similarityTotal += comparable.similarityScore;
      maxDistance = Math.max(maxDistance, comparable.distance);
    }

    const averageSimilarity = similarityTotal / comparables.length;
    const metadata: ValuationMetadataDto = {
      method: 'comparable-sales',
      radiusKm: maxDistance,
      source: 'api-extensions/property-valuation',
    };

    return {
      propertyId: property.id,
      estimatedValue: Math.round(weightedTotal / totalWeight),
      confidence: Math.round(
        Math.min(100, averageSimilarity * Math.min(1, comparables.length / 5)),
      ),
      comparableCount: comparables.length,
      comparables,
      valuationDate: new Date(),
      metadata,
    };
  }
}
