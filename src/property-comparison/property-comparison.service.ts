// @ts-nocheck

import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../database/prisma.service';
import { v4 as uuidv4 } from 'uuid';

const COMPARABLE_FIELDS = [
  'title',
  'address',
  'city',
  'state',
  'zipCode',
  'country',
  'price',
  'propertyType',
  'bedrooms',
  'bathrooms',
  'squareFeet',
  'lotSize',
  'yearBuilt',
  'status',
  'features',
  'latitude',
  'longitude',
] as const;

type ComparableField = (typeof COMPARABLE_FIELDS)[number];

const NUMERIC_FIELDS: ReadonlySet<ComparableField> = new Set<ComparableField>([
  'price',
  'bedrooms',
  'bathrooms',
  'squareFeet',
  'lotSize',
  'yearBuilt',
]);

const SCORE_WEIGHTS = {
  pricePerSqft: 0.3,
  locationScore: 0.25,
  condition: 0.25,
  age: 0.2,
};

export interface FieldRow {
  field: ComparableField;
  values: unknown[];
  allEqual: boolean;
  min?: number | null;
  max?: number | null;
  bestIndex?: number | null;
  worstIndex?: number | null;
}

@Injectable()
export class PropertyComparisonService {
  constructor(private readonly prisma: PrismaService) {}

  async compare(ids: string[]) {
    const properties = await this.prisma.property.findMany({
      where: { id: { in: ids } },
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

    if (properties.length !== ids.length) {
      const found = new Set(properties.map((p) => p.id));
      const missing = ids.filter((id) => !found.has(id));
      throw new NotFoundException(`Properties not found: ${missing.join(', ')}`);
    }

    const ordered = ids.map((id) => properties.find((p) => p.id === id)!);

    const comparison: FieldRow[] = COMPARABLE_FIELDS.map((field) =>
      this.buildFieldRow(field, ordered),
    );

    const differingFields = comparison.filter((row) => !row.allEqual).map((row) => row.field);
    const commonFields = comparison.filter((row) => row.allEqual).map((row) => row.field);

    return {
      count: ordered.length,
      properties: ordered,
      comparison,
      differingFields,
      commonFields,
    };
  }

  calculateScore(properties: any[]) {
    const currentYear = new Date().getFullYear();

    const scores = properties.map((property) => {
      const price = (this.normalize(property.price) as number) || 0;
      const sqft = (this.normalize(property.squareFeet) as number) || 0;
      const pricePerSqft = sqft > 0 ? price / sqft : 0;

      const yearBuilt = property.yearBuilt || currentYear;
      const age = currentYear - yearBuilt;

      let locationScore = 50;
      if (property.latitude && property.longitude) {
        locationScore = this.calculateLocationScore(property.latitude, property.longitude);
      }

      let conditionScore = 50;
      if (property.features && Array.isArray(property.features)) {
        const featureCount = property.features.length;
        conditionScore = Math.min(100, 30 + featureCount * 5);
      }

      const normalizedPricePerSqft = pricePerSqft > 0 ? Math.max(0, 100 - pricePerSqft / 10) : 50;
      const normalizedAge = Math.max(0, 100 - age);
      const normalizedCondition = conditionScore;

      const weightedScore =
        normalizedPricePerSqft * SCORE_WEIGHTS.pricePerSqft +
        locationScore * SCORE_WEIGHTS.locationScore +
        normalizedCondition * SCORE_WEIGHTS.condition +
        normalizedAge * SCORE_WEIGHTS.age;

      return {
        propertyId: property.id,
        title: property.title,
        pricePerSqft: Math.round(pricePerSqft * 100) / 100,
        locationScore: Math.round(locationScore * 100) / 100,
        conditionScore: Math.round(normalizedCondition * 100) / 100,
        age,
        weightedScore: Math.round(weightedScore * 100) / 100,
      };
    });

    const sorted = [...scores].sort((a, b) => b.weightedScore - a.weightedScore);

    return {
      scores: sorted,
      best: sorted[0] || null,
      weights: SCORE_WEIGHTS,
    };
  }

  async createShareableLink(propertyIds: string[], createdById?: string) {
    const properties = await this.prisma.property.findMany({
      where: { id: { in: propertyIds } },
      select: { id: true },
    });

    if (properties.length !== propertyIds.length) {
      const found = new Set(properties.map((p) => p.id));
      const missing = propertyIds.filter((id) => !found.has(id));
      throw new NotFoundException(`Properties not found: ${missing.join(', ')}`);
    }

    const shareToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const share = await this.prisma.comparisonShare.create({
      data: {
        shareToken,
        propertyIds,
        createdById: createdById || null,
        expiresAt,
      },
    });

    return {
      shareToken: share.shareToken,
      propertyIds: share.propertyIds,
      expiresAt: share.expiresAt,
      url: `/property-comparison/shared/${share.shareToken}`,
    };
  }

  async getSharedComparison(shareToken: string) {
    const share = await this.prisma.comparisonShare.findUnique({
      where: { shareToken },
    });

    if (!share) {
      throw new NotFoundException('Shared comparison not found');
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new NotFoundException('This shared comparison link has expired');
    }

    const comparison = await this.compare(share.propertyIds);

    return {
      shareToken: share.shareToken,
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
      ...comparison,
    };
  }

  async exportComparison(propertyIds: string[]) {
    const result = await this.compare(propertyIds);
    const scoreResult = this.calculateScore(result.properties);

    const exportData = {
      title: 'Property Comparison Report',
      generatedAt: new Date().toISOString(),
      propertyCount: result.count,
      properties: result.properties.map((p) => ({
        id: p.id,
        title: p.title,
        address: `${p.address}, ${p.city}, ${p.state} ${p.zipCode}`,
        price: this.normalize(p.price),
        propertyType: p.propertyType,
        bedrooms: p.bedrooms,
        bathrooms: this.normalize(p.bathrooms),
        squareFeet: this.normalize(p.squareFeet),
        lotSize: this.normalize(p.lotSize),
        yearBuilt: p.yearBuilt,
        status: p.status,
        features: p.features,
      })),
      comparison: {
        differingFields: result.differingFields,
        commonFields: result.commonFields,
      },
      scores: scoreResult.scores,
      summary: {
        bestValue: scoreResult.best,
        averagePrice: this.average(
          result.properties.map((p) => this.normalize(p.price) as number).filter((v) => v > 0),
        ),
        averageSqft: this.average(
          result.properties.map((p) => this.normalize(p.squareFeet) as number).filter((v) => v > 0),
        ),
      },
    };

    return exportData;
  }

  private calculateLocationScore(lat: number, lng: number): number {
    const urbanCenterLat = 40.7128;
    const urbanCenterLng = -74.006;
    const distance = Math.sqrt(
      Math.pow(lat - urbanCenterLat, 2) + Math.pow(lng - urbanCenterLng, 2),
    );
    return Math.max(0, Math.min(100, 100 - distance * 10));
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
  }

  private buildFieldRow(
    field: ComparableField,
    properties: Array<Record<string, unknown>>,
  ): FieldRow {
    const rawValues = properties.map((p) => p[field]);
    const normalizedValues = rawValues.map((v) => this.normalize(v));

    const allEqual = normalizedValues.every((v, _i, arr) => this.deepEqual(v, arr[0]));

    const row: FieldRow = {
      field,
      values: normalizedValues,
      allEqual,
    };

    if (NUMERIC_FIELDS.has(field)) {
      const numerics = normalizedValues.map((v) => (typeof v === 'number' ? v : null));
      const present = numerics
        .map((v, i) => ({ v, i }))
        .filter((x): x is { v: number; i: number } => x.v !== null);

      if (present.length > 0) {
        const minEntry = present.reduce((a, b) => (a.v <= b.v ? a : b));
        const maxEntry = present.reduce((a, b) => (a.v >= b.v ? a : b));
        row.min = minEntry.v;
        row.max = maxEntry.v;

        if (field === 'price') {
          row.bestIndex = minEntry.i;
          row.worstIndex = maxEntry.i;
        } else {
          row.bestIndex = maxEntry.i;
          row.worstIndex = minEntry.i;
        }
      } else {
        row.min = null;
        row.max = null;
        row.bestIndex = null;
        row.worstIndex = null;
      }
    }

    return row;
  }

  private normalize(value: unknown): unknown {
    if (value === null || value === undefined) {
      return null;
    }
    if (value instanceof Decimal) {
      return value.toNumber();
    }
    if (Array.isArray(value)) {
      return [...value].sort();
    }
    return value;
  }

  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!this.deepEqual(a[i], b[i])) return false;
      }
      return true;
    }
    return false;
  }
}
