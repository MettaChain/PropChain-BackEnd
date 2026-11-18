import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';

export enum AmenityAggregationCategory {
  INTERIOR = 'INTERIOR',
  EXTERIOR = 'EXTERIOR',
  COMMUNITY = 'COMMUNITY',
  SAFETY = 'SAFETY',
  UTILITY = 'UTILITY',
}

export interface AmenityCatalogItem {
  id: string;
  name: string;
  category: AmenityAggregationCategory;
  description?: string;
  icon?: string;
  isCustom: boolean;
}

export interface CreateCustomAmenityInput {
  name: string;
  category: AmenityAggregationCategory;
  description?: string;
  icon?: string;
}

@Injectable()
export class AmenityAggregationService {
  private readonly catalog = new Map<string, AmenityCatalogItem>();
  private readonly propertyAmenities = new Map<string, Set<string>>();
  private readonly catalogCache = new Map<string, { expiresAt: number; items: AmenityCatalogItem[] }>();
  private readonly cacheTtlMs = 60 * 60 * 1000;

  constructor() {
    this.seedCatalog();
  }

  getCatalog(): AmenityCatalogItem[] {
    const cached = this.catalogCache.get('catalog');
    if (cached && cached.expiresAt > Date.now()) {
      return cached.items.map((item) => ({ ...item }));
    }

    const items = Array.from(this.catalog.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((item) => ({ ...item }));
    this.catalogCache.set('catalog', { expiresAt: Date.now() + this.cacheTtlMs, items });
    return items.map((item) => ({ ...item }));
  }

  createCustom(input: CreateCustomAmenityInput): AmenityCatalogItem {
    const normalized = input.name.trim().toLowerCase();
    if (!normalized) throw new BadRequestException('Amenity name is required');
    if (
      Array.from(this.catalog.values()).some(
        (item) => item.name.toLowerCase() === normalized,
      )
    ) {
      throw new BadRequestException(`Amenity ${input.name} already exists`);
    }

    const item: AmenityCatalogItem = {
      id: randomUUID(),
      name: input.name.trim(),
      category: input.category,
      description: input.description?.trim(),
      icon: input.icon,
      isCustom: true,
    };
    this.catalog.set(item.id, item);
    this.catalogCache.delete('catalog');
    return { ...item };
  }

  assignToProperty(propertyId: string, amenityIds: string[]): AmenityCatalogItem[] {
    const missing = amenityIds.filter((id) => !this.catalog.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(`Amenities not found: ${missing.join(', ')}`);
    }

    const assigned = this.propertyAmenities.get(propertyId) ?? new Set<string>();
    amenityIds.forEach((id) => assigned.add(id));
    this.propertyAmenities.set(propertyId, assigned);
    return this.getPropertyAmenities(propertyId);
  }

  getPropertyAmenities(propertyId: string): AmenityCatalogItem[] {
    const ids = this.propertyAmenities.get(propertyId);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.catalog.get(id))
      .filter((item): item is AmenityCatalogItem => Boolean(item))
      .map((item) => ({ ...item }));
  }

  grouped(): Record<string, AmenityCatalogItem[]> {
    return Object.values(AmenityAggregationCategory).reduce<Record<string, AmenityCatalogItem[]>>(
      (acc, category) => {
        acc[category] = this.getCatalog().filter((item) => item.category === category);
        return acc;
      },
      {},
    );
  }

  autocomplete(search: string): AmenityCatalogItem[] {
    const term = (search ?? '').trim().toLowerCase();
    if (!term) return [];
    return this.getCatalog()
      .filter((item) => item.name.toLowerCase().includes(term))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(term) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(term) ? 0 : 1;
        return aStarts - bStarts || a.name.localeCompare(b.name);
      })
      .slice(0, 10);
  }

  private seedCatalog(): void {
    const items: Array<[string, AmenityAggregationCategory]> = [
      ['Air Conditioning', AmenityAggregationCategory.INTERIOR],
      ['Hardwood Floors', AmenityAggregationCategory.INTERIOR],
      ['Balcony', AmenityAggregationCategory.EXTERIOR],
      ['Private Pool', AmenityAggregationCategory.EXTERIOR],
      ['Fitness Center', AmenityAggregationCategory.COMMUNITY],
      ['Clubhouse', AmenityAggregationCategory.COMMUNITY],
      ['Gated Community', AmenityAggregationCategory.SAFETY],
      ['Security System', AmenityAggregationCategory.SAFETY],
      ['Solar Panels', AmenityAggregationCategory.UTILITY],
      ['EV Charging', AmenityAggregationCategory.UTILITY],
    ];

    for (const [name, category] of items) {
      const item: AmenityCatalogItem = {
        id: randomUUID(),
        name,
        category,
        isCustom: false,
      };
      this.catalog.set(item.id, item);
    }
  }
}
