import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ComparableSaleDto, ValuationMetadataDto } from '../dto/property-valuation.dto';

export interface PropertyCharacteristics {
  sizeSqm: number;
  age: number;
  amenityScore: number;
}

export interface ComparableInput extends ComparableSaleDto {
  characteristics?: PropertyCharacteristics;
}

export interface ValuationRequest {
  propertyId: string;
  comparables?: ComparableInput[];
  subjectCharacteristics?: PropertyCharacteristics;
  notes?: string;
}

export interface ValuationResult {
  id: string;
  propertyId: string;
  estimatedValue: number;
  confidence: number;
  comparableCount: number;
  comparables: ComparableInput[];
  valuationDate: Date;
  metadata: ValuationMetadataDto;
  fromCache: boolean;
}

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const ADJUSTMENT_PER_SQM = 150;
const ADJUSTMENT_PER_YEAR_AGE = -500;
const ADJUSTMENT_PER_AMENITY_POINT = 1000;
const DISTANCE_DECAY_PER_KM = 2;

interface CacheEntry {
  result: ValuationResult;
  expiresAt: number;
}

@Injectable()
export class PropertyValuationService {
  private readonly valuations = new Map<string, ValuationResult>();
  private readonly cache = new Map<string, CacheEntry>();
  private cacheTtlMs: number = DEFAULT_CACHE_TTL_MS;

  estimate(request: ValuationRequest): ValuationResult {
    if (!request.propertyId) {
      throw new BadRequestException('propertyId is required');
    }

    const cacheKey = this.buildCacheKey(request);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    const comparables = request.comparables ?? [];
    const result = this.computeValuation(request, comparables);

    this.valuations.set(result.id, result);
    this.cache.set(cacheKey, { result, expiresAt: Date.now() + this.cacheTtlMs });

    return { ...result, fromCache: false };
  }

  get(id: string): ValuationResult {
    const result = this.valuations.get(id);
    if (!result) {
      throw new NotFoundException(`Valuation ${id} not found`);
    }
    return { ...result };
  }

  invalidateCache(propertyId?: string): void {
    if (!propertyId) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${propertyId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  private computeValuation(
    request: ValuationRequest,
    comparables: ComparableInput[],
  ): ValuationResult {
    if (comparables.length === 0) {
      return {
        id: randomUUID(),
        propertyId: request.propertyId,
        estimatedValue: 0,
        confidence: 0,
        comparableCount: 0,
        comparables: [],
        valuationDate: new Date(),
        metadata: {
          method: 'none',
          source: 'comparable-sales',
        },
        fromCache: false,
      };
    }

    if (comparables.length === 1) {
      const [only] = comparables;
      const adjusted = this.adjustComparable(only, request.subjectCharacteristics);
      return {
        id: randomUUID(),
        propertyId: request.propertyId,
        estimatedValue: Number(adjusted.toFixed(2)),
        confidence: Math.min(40, only.similarityScore / 2),
        comparableCount: 1,
        comparables,
        valuationDate: new Date(),
        metadata: {
          method: 'single-comparable',
          source: 'comparable-sales',
        },
        fromCache: false,
      };
    }

    let weightedSum = 0;
    let weightTotal = 0;

    for (const comparable of comparables) {
      const adjustedPrice = this.adjustComparable(comparable, request.subjectCharacteristics);
      const distancePenalty = Math.max(0, 1 - comparable.distance * (DISTANCE_DECAY_PER_KM / 100));
      const weight = Math.max(0.01, (comparable.similarityScore / 100) * distancePenalty);

      weightedSum += adjustedPrice * weight;
      weightTotal += weight;
    }

    const estimatedValue = weightTotal > 0 ? weightedSum / weightTotal : 0;
    const averageSimilarity =
      comparables.reduce((sum, item) => sum + item.similarityScore, 0) / comparables.length;
    const sampleSizeBonus = Math.min(20, comparables.length * 4);
    const confidence = Math.min(100, Math.round(averageSimilarity * 0.6 + sampleSizeBonus));

    return {
      id: randomUUID(),
      propertyId: request.propertyId,
      estimatedValue: Number(estimatedValue.toFixed(2)),
      confidence,
      comparableCount: comparables.length,
      comparables,
      valuationDate: new Date(),
      metadata: {
        method: 'weighted-comparable-analysis',
        radiusKm: Math.max(...comparables.map((item) => item.distance)),
        source: 'comparable-sales',
      },
      fromCache: false,
    };
  }

  private adjustComparable(
    comparable: ComparableInput,
    subject?: PropertyCharacteristics,
  ): number {
    let price = comparable.salePrice;

    if (subject && comparable.characteristics) {
      const sizeDelta = subject.sizeSqm - comparable.characteristics.sizeSqm;
      const ageDelta = subject.age - comparable.characteristics.age;
      const amenityDelta = subject.amenityScore - comparable.characteristics.amenityScore;

      price += sizeDelta * ADJUSTMENT_PER_SQM;
      price += ageDelta * ADJUSTMENT_PER_YEAR_AGE;
      price += amenityDelta * ADJUSTMENT_PER_AMENITY_POINT;
    }

    return Math.max(0, price);
  }

  private buildCacheKey(request: ValuationRequest): string {
    const comparableKey = (request.comparables ?? [])
      .map((item) => `${item.address}:${item.salePrice}:${item.distance}:${item.similarityScore}`)
      .sort()
      .join('|');
    return `${request.propertyId}:${comparableKey}`;
  }

  private getFromCache(key: string): ValuationResult | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.result;
  }
}
