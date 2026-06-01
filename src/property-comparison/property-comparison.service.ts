import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../database/prisma.service';

/** Fields included in the side-by-side comparison view. */
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

/** Numeric fields used to compute min/max highlights. */
const NUMERIC_FIELDS: ReadonlySet<ComparableField> = new Set<ComparableField>([
  'price',
  'bedrooms',
  'bathrooms',
  'squareFeet',
  'lotSize',
  'yearBuilt',
]);

export interface FieldRow {
  field: ComparableField;
  values: unknown[];
  allEqual: boolean;
  min?: number | null;
  max?: number | null;
  bestIndex?: number | null; // index of property with min price / largest area, etc.
  worstIndex?: number | null;
}

@Injectable()
export class PropertyComparisonService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compare 2-4 properties side-by-side and highlight differing fields.
   */
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

    // Validate all requested IDs exist.
    if (properties.length !== ids.length) {
      const found = new Set(properties.map((p) => p.id));
      const missing = ids.filter((id) => !found.has(id));
      throw new NotFoundException(`Properties not found: ${missing.join(', ')}`);
    }

    // Preserve the order requested by the caller.
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

        // For price → lowest is "best". For everything else higher is better.
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

  /** Convert Prisma `Decimal` to number; sort feature arrays for stable comparison. */
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
