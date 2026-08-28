import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export interface FilterOption {
  field: string;
  type: 'range' | 'select' | 'multi-select' | 'boolean' | 'date';
  label: string;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  step?: number;
}

export interface SavedFilter {
  id: string;
  userId: string;
  name: string;
  filters: Record<string, unknown>;
  isQuickFilter: boolean;
  createdAt: Date;
  usageCount: number;
}

export interface FilterCombination {
  operator: 'AND' | 'OR';
  filters: Record<string, unknown>[];
}

interface SaveFilterDto {
  name: string;
  filters: Record<string, unknown>;
  isQuickFilter?: boolean;
}

interface RangeFilter {
  min?: number;
  max?: number;
}

interface DateRangeFilter {
  start?: string | Date;
  end?: string | Date;
}

@Injectable()
export class SearchFiltersService {
  constructor(private readonly prisma: PrismaService) {}

  async applyFilters(
    whereClause: Prisma.PropertyWhereInput,
    filters: Record<string, unknown>,
  ): Promise<Prisma.PropertyWhereInput> {
    const filterKeys = Object.keys(filters);

    for (const key of filterKeys) {
      const value = filters[key];
      if (value === undefined || value === null) continue;

      switch (key) {
        case 'price':
          whereClause = this.applyPriceFilter(whereClause, value);
          break;
        case 'bedrooms':
          whereClause = this.applyBedroomsFilter(whereClause, value);
          break;
        case 'bathrooms':
          whereClause = this.applyBathroomsFilter(whereClause, value);
          break;
        case 'squareFeet':
          whereClause = this.applySquareFeetFilter(whereClause, value);
          break;
        case 'propertyType':
          whereClause = this.applyPropertyTypeFilter(whereClause, value);
          break;
        case 'status':
          whereClause = this.applyStatusFilter(whereClause, value);
          break;
        case 'yearBuilt':
          whereClause = this.applyYearBuiltFilter(whereClause, value);
          break;
        case 'features':
          whereClause = this.applyFeaturesFilter(whereClause, value);
          break;
        case 'city':
          whereClause = this.applyCityFilter(whereClause, value);
          break;
        case 'state':
          whereClause = this.applyStateFilter(whereClause, value);
          break;
        case 'dateRange':
          whereClause = this.applyDateRangeFilter(whereClause, value);
          break;
        default:
          // Handle custom filters
          whereClause = this.applyCustomFilter(whereClause, key, value);
      }
    }

    return whereClause;
  }

  private applyPriceFilter(
    whereClause: Prisma.PropertyWhereInput,
    priceInput: unknown,
  ): Prisma.PropertyWhereInput {
    const price = priceInput as RangeFilter;
    if (price.min !== undefined || price.max !== undefined) {
      const range: { gte?: number; lte?: number } = {};
      if (price.min !== undefined) range.gte = price.min;
      if (price.max !== undefined) range.lte = price.max;
      whereClause.price = range as Prisma.PropertyWhereInput['price'];
    }
    return whereClause;
  }

  private applyBedroomsFilter(
    whereClause: Prisma.PropertyWhereInput,
    bedroomsInput: unknown,
  ): Prisma.PropertyWhereInput {
    if (typeof bedroomsInput === 'number') {
      whereClause.bedrooms = bedroomsInput;
    } else {
      const bedrooms = bedroomsInput as RangeFilter;
      if (bedrooms.min !== undefined || bedrooms.max !== undefined) {
        const range: { gte?: number; lte?: number } = {};
        if (bedrooms.min !== undefined) range.gte = bedrooms.min;
        if (bedrooms.max !== undefined) range.lte = bedrooms.max;
        whereClause.bedrooms = range as Prisma.PropertyWhereInput['bedrooms'];
      }
    }
    return whereClause;
  }

  private applyBathroomsFilter(
    whereClause: Prisma.PropertyWhereInput,
    bathroomsInput: unknown,
  ): Prisma.PropertyWhereInput {
    if (typeof bathroomsInput === 'number') {
      whereClause.bathrooms = bathroomsInput;
    } else {
      const bathrooms = bathroomsInput as RangeFilter;
      if (bathrooms.min !== undefined || bathrooms.max !== undefined) {
        const range: { gte?: number; lte?: number } = {};
        if (bathrooms.min !== undefined) range.gte = bathrooms.min;
        if (bathrooms.max !== undefined) range.lte = bathrooms.max;
        whereClause.bathrooms = range as Prisma.PropertyWhereInput['bathrooms'];
      }
    }
    return whereClause;
  }

  private applySquareFeetFilter(
    whereClause: Prisma.PropertyWhereInput,
    squareFeetInput: unknown,
  ): Prisma.PropertyWhereInput {
    const squareFeet = squareFeetInput as RangeFilter;
    if (squareFeet.min !== undefined || squareFeet.max !== undefined) {
      const range: { gte?: number; lte?: number } = {};
      if (squareFeet.min !== undefined) range.gte = squareFeet.min;
      if (squareFeet.max !== undefined) range.lte = squareFeet.max;
      whereClause.squareFeet = range as Prisma.PropertyWhereInput['squareFeet'];
    }
    return whereClause;
  }

  private applyPropertyTypeFilter(
    whereClause: Prisma.PropertyWhereInput,
    propertyType: unknown,
  ): Prisma.PropertyWhereInput {
    if (Array.isArray(propertyType)) {
      whereClause.propertyType = { in: propertyType as string[] };
    } else {
      whereClause.propertyType = propertyType as Prisma.PropertyWhereInput['propertyType'];
    }
    return whereClause;
  }

  private applyStatusFilter(
    whereClause: Prisma.PropertyWhereInput,
    status: unknown,
  ): Prisma.PropertyWhereInput {
    if (Array.isArray(status)) {
      whereClause.status = { in: status as Prisma.PropertyWhereInput['status'] as never };
    } else {
      whereClause.status = status as Prisma.PropertyWhereInput['status'];
    }
    return whereClause;
  }

  private applyYearBuiltFilter(
    whereClause: Prisma.PropertyWhereInput,
    yearBuiltInput: unknown,
  ): Prisma.PropertyWhereInput {
    const yearBuilt = yearBuiltInput as RangeFilter;
    if (yearBuilt.min !== undefined || yearBuilt.max !== undefined) {
      const range: { gte?: number; lte?: number } = {};
      if (yearBuilt.min !== undefined) range.gte = yearBuilt.min;
      if (yearBuilt.max !== undefined) range.lte = yearBuilt.max;
      whereClause.yearBuilt = range as Prisma.PropertyWhereInput['yearBuilt'];
    }
    return whereClause;
  }

  private applyFeaturesFilter(
    whereClause: Prisma.PropertyWhereInput,
    featuresInput: unknown,
  ): Prisma.PropertyWhereInput {
    const features = Array.isArray(featuresInput) ? (featuresInput as string[]) : [];
    if (features.length > 0) {
      whereClause.features = { hasSome: features };
    }
    return whereClause;
  }

  private applyCityFilter(
    whereClause: Prisma.PropertyWhereInput,
    city: unknown,
  ): Prisma.PropertyWhereInput {
    if (Array.isArray(city)) {
      whereClause.city = { in: city as string[] };
    } else {
      whereClause.city = city as Prisma.PropertyWhereInput['city'];
    }
    return whereClause;
  }

  private applyStateFilter(
    whereClause: Prisma.PropertyWhereInput,
    state: unknown,
  ): Prisma.PropertyWhereInput {
    if (Array.isArray(state)) {
      whereClause.state = { in: state as string[] };
    } else {
      whereClause.state = state as Prisma.PropertyWhereInput['state'];
    }
    return whereClause;
  }

  private applyDateRangeFilter(
    whereClause: Prisma.PropertyWhereInput,
    dateRangeInput: unknown,
  ): Prisma.PropertyWhereInput {
    const dateRange = dateRangeInput as DateRangeFilter;
    if (dateRange.start || dateRange.end) {
      const range: { gte?: Date; lte?: Date } = {};
      if (dateRange.start) range.gte = new Date(dateRange.start);
      if (dateRange.end) range.lte = new Date(dateRange.end);
      whereClause.createdAt = range;
    }
    return whereClause;
  }

  private applyCustomFilter(
    whereClause: Prisma.PropertyWhereInput,
    key: string,
    value: unknown,
  ): Prisma.PropertyWhereInput {
    (whereClause as Record<string, unknown>)[key] = value;
    return whereClause;
  }

  async getFilterOptions(): Promise<FilterOption[]> {
    return [
      {
        field: 'price',
        type: 'range',
        label: 'Price',
        min: 0,
        max: 10000000,
        step: 10000,
      },
      {
        field: 'bedrooms',
        type: 'range',
        label: 'Bedrooms',
        min: 0,
        max: 10,
        step: 1,
      },
      {
        field: 'bathrooms',
        type: 'range',
        label: 'Bathrooms',
        min: 0,
        max: 10,
        step: 0.5,
      },
      {
        field: 'squareFeet',
        type: 'range',
        label: 'Square Feet',
        min: 0,
        max: 10000,
        step: 100,
      },
      {
        field: 'propertyType',
        type: 'multi-select',
        label: 'Property Type',
        options: [
          { value: 'House', label: 'House' },
          { value: 'Apartment', label: 'Apartment' },
          { value: 'Condo', label: 'Condo' },
          { value: 'Townhouse', label: 'Townhouse' },
          { value: 'Land', label: 'Land' },
        ],
      },
      {
        field: 'status',
        type: 'multi-select',
        label: 'Status',
        options: [
          { value: 'ACTIVE', label: 'Active' },
          { value: 'PENDING', label: 'Pending' },
          { value: 'UNDER_CONTRACT', label: 'Under Contract' },
          { value: 'SOLD', label: 'Sold' },
        ],
      },
      {
        field: 'yearBuilt',
        type: 'range',
        label: 'Year Built',
        min: 1900,
        max: new Date().getFullYear(),
        step: 1,
      },
      {
        field: 'features',
        type: 'multi-select',
        label: 'Features',
        options: [
          { value: 'pool', label: 'Pool' },
          { value: 'garage', label: 'Garage' },
          { value: 'garden', label: 'Garden' },
          { value: 'balcony', label: 'Balcony' },
          { value: 'fireplace', label: 'Fireplace' },
          { value: 'basement', label: 'Basement' },
        ],
      },
    ];
  }

  async saveFilter(userId: string, filterData: SaveFilterDto): Promise<SavedFilter> {
    // This would typically save to database
    // For now, return mock data
    const savedFilter: SavedFilter = {
      id: `filter_${Date.now()}`,
      userId,
      name: filterData.name,
      filters: filterData.filters,
      isQuickFilter: filterData.isQuickFilter || false,
      createdAt: new Date(),
      usageCount: 0,
    };

    return savedFilter;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getSavedFilters(userId: string): Promise<SavedFilter[]> {
    // This would typically query database
    // For now, return empty array
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getQuickFilters(userId: string): Promise<SavedFilter[]> {
    // This would typically query database
    // For now, return empty array
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateFilterUsage(filterId: string): Promise<void> {
    // This would typically update database
    // For now, do nothing
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async deleteFilter(userId: string, filterId: string): Promise<void> {
    // This would typically delete from database
    // For now, do nothing
  }

  async applyFilterCombination(
    whereClause: Prisma.PropertyWhereInput,
    combination: FilterCombination,
  ): Promise<Prisma.PropertyWhereInput> {
    const conditions = await Promise.all(
      combination.filters.map((filter) => this.applyFilters({}, filter)),
    );
    const toArray = (v: Prisma.PropertyWhereInput['AND']): Prisma.PropertyWhereInput[] =>
      v === undefined ? [] : Array.isArray(v) ? v : [v];

    if (combination.operator === 'AND') {
      whereClause.AND = [...toArray(whereClause.AND), ...conditions];
    } else if (combination.operator === 'OR') {
      whereClause.OR = [...toArray(whereClause.OR), ...conditions];
    }

    return whereClause;
  }
}
