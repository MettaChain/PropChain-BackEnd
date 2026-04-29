import { Injectable } from '@nestjs/common';
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
  filters: Record<string, any>;
  isQuickFilter: boolean;
  createdAt: Date;
  usageCount: number;
}

export interface FilterCombination {
  operator: 'AND' | 'OR';
  filters: Record<string, any>[];
}

@Injectable()
export class SearchFiltersService {
  constructor(private readonly prisma: PrismaService) {}

  async applyFilters(whereClause: any, filters: Record<string, any>): Promise<any> {
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

  private applyPriceFilter(whereClause: any, price: any): any {
    if (price.min !== undefined || price.max !== undefined) {
      whereClause.price = {};
      if (price.min !== undefined) {
        whereClause.price.gte = price.min;
      }
      if (price.max !== undefined) {
        whereClause.price.lte = price.max;
      }
    }
    return whereClause;
  }

  private applyBedroomsFilter(whereClause: any, bedrooms: any): any {
    if (typeof bedrooms === 'number') {
      whereClause.bedrooms = bedrooms;
    } else if (bedrooms.min !== undefined || bedrooms.max !== undefined) {
      whereClause.bedrooms = {};
      if (bedrooms.min !== undefined) {
        whereClause.bedrooms.gte = bedrooms.min;
      }
      if (bedrooms.max !== undefined) {
        whereClause.bedrooms.lte = bedrooms.max;
      }
    }
    return whereClause;
  }

  private applyBathroomsFilter(whereClause: any, bathrooms: any): any {
    if (typeof bathrooms === 'number') {
      whereClause.bathrooms = bathrooms;
    } else if (bathrooms.min !== undefined || bathrooms.max !== undefined) {
      whereClause.bathrooms = {};
      if (bathrooms.min !== undefined) {
        whereClause.bathrooms.gte = bathrooms.min;
      }
      if (bathrooms.max !== undefined) {
        whereClause.bathrooms.lte = bathrooms.max;
      }
    }
    return whereClause;
  }

  private applySquareFeetFilter(whereClause: any, squareFeet: any): any {
    if (squareFeet.min !== undefined || squareFeet.max !== undefined) {
      whereClause.squareFeet = {};
      if (squareFeet.min !== undefined) {
        whereClause.squareFeet.gte = squareFeet.min;
      }
      if (squareFeet.max !== undefined) {
        whereClause.squareFeet.lte = squareFeet.max;
      }
    }
    return whereClause;
  }

  private applyPropertyTypeFilter(whereClause: any, propertyType: any): any {
    if (Array.isArray(propertyType)) {
      whereClause.propertyType = { in: propertyType };
    } else {
      whereClause.propertyType = propertyType;
    }
    return whereClause;
  }

  private applyStatusFilter(whereClause: any, status: any): any {
    if (Array.isArray(status)) {
      whereClause.status = { in: status };
    } else {
      whereClause.status = status;
    }
    return whereClause;
  }

  private applyYearBuiltFilter(whereClause: any, yearBuilt: any): any {
    if (yearBuilt.min !== undefined || yearBuilt.max !== undefined) {
      whereClause.yearBuilt = {};
      if (yearBuilt.min !== undefined) {
        whereClause.yearBuilt.gte = yearBuilt.min;
      }
      if (yearBuilt.max !== undefined) {
        whereClause.yearBuilt.lte = yearBuilt.max;
      }
    }
    return whereClause;
  }

  private applyFeaturesFilter(whereClause: any, features: string[]): any {
    if (features.length > 0) {
      whereClause.features = { hasSome: features };
    }
    return whereClause;
  }

  private applyCityFilter(whereClause: any, city: any): any {
    if (Array.isArray(city)) {
      whereClause.city = { in: city };
    } else {
      whereClause.city = city;
    }
    return whereClause;
  }

  private applyStateFilter(whereClause: any, state: any): any {
    if (Array.isArray(state)) {
      whereClause.state = { in: state };
    } else {
      whereClause.state = state;
    }
    return whereClause;
  }

  private applyDateRangeFilter(whereClause: any, dateRange: any): any {
    if (dateRange.start || dateRange.end) {
      whereClause.createdAt = {};
      if (dateRange.start) {
        whereClause.createdAt.gte = new Date(dateRange.start);
      }
      if (dateRange.end) {
        whereClause.createdAt.lte = new Date(dateRange.end);
      }
    }
    return whereClause;
  }

  private applyCustomFilter(whereClause: any, key: string, value: any): any {
    whereClause[key] = value;
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

  async saveFilter(userId: string, filterData: any): Promise<SavedFilter> {
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

  async getSavedFilters(userId: string): Promise<SavedFilter[]> {
    // This would typically query database
    // For now, return empty array
    return [];
  }

  async getQuickFilters(userId: string): Promise<SavedFilter[]> {
    // This would typically query database
    // For now, return empty array
    return [];
  }

  async updateFilterUsage(filterId: string): Promise<void> {
    // This would typically update database
    // For now, do nothing
  }

  async deleteFilter(userId: string, filterId: string): Promise<void> {
    // This would typically delete from database
    // For now, do nothing
  }

  async applyFilterCombination(whereClause: any, combination: FilterCombination): Promise<any> {
    if (combination.operator === 'AND') {
      const conditions = combination.filters.map((filter) => this.applyFilters({}, filter));
      whereClause.AND = [...(whereClause.AND || []), ...conditions];
    } else if (combination.operator === 'OR') {
      const conditions = combination.filters.map((filter) => this.applyFilters({}, filter));
      whereClause.OR = [...(whereClause.OR || []), ...conditions];
    }

    return whereClause;
  }
}
