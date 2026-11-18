import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  AmenityCategory,
  AmenityQueryDto,
  AmenityResponseDto,
  AssignPropertyAmenitiesDto,
  CreateAmenityDto,
} from './dto/amenity.dto';

interface AmenityRecord extends AmenityResponseDto {
  normalizedName: string;
}

@Injectable()
export class AmenityManagementService {
  private readonly amenities = new Map<string, AmenityRecord>();
  private readonly propertyAmenities = new Map<string, Set<string>>();

  constructor() {
    this.seedCatalog();
  }

  create(dto: CreateAmenityDto): AmenityResponseDto {
    const normalizedName = dto.name.trim().toLowerCase();
    const duplicate = Array.from(this.amenities.values()).find(
      (amenity) => amenity.normalizedName === normalizedName,
    );
    if (duplicate) {
      throw new ConflictException(`Amenity ${dto.name} already exists`);
    }

    const record: AmenityRecord = {
      id: randomUUID(),
      name: dto.name.trim(),
      category: dto.category,
      icon: dto.icon,
      description: dto.description,
      isCustom: true,
      createdAt: new Date(),
      normalizedName,
    };
    this.amenities.set(record.id, record);
    return this.toResponse(record);
  }

  list(query: AmenityQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim().toLowerCase();
    const filtered = Array.from(this.amenities.values())
      .filter((amenity) => !query.category || amenity.category === query.category)
      .filter((amenity) => !search || amenity.normalizedName.includes(search))
      .sort((a, b) => a.name.localeCompare(b.name));
    const start = (page - 1) * limit;

    return {
      data: filtered.slice(start, start + limit).map((amenity) => this.toResponse(amenity)),
      page,
      limit,
      total: filtered.length,
      totalPages: Math.ceil(filtered.length / limit),
    };
  }

  grouped() {
    return Object.values(AmenityCategory).reduce<Record<string, AmenityResponseDto[]>>(
      (acc, category) => {
        acc[category] = Array.from(this.amenities.values())
          .filter((amenity) => amenity.category === category)
          .map((amenity) => this.toResponse(amenity));
        return acc;
      },
      {},
    );
  }

  autocomplete(search: string): AmenityResponseDto[] {
    const term = (search ?? '').trim().toLowerCase();
    if (!term) return [];

    return Array.from(this.amenities.values())
      .filter((amenity) => amenity.normalizedName.includes(term))
      .sort((a, b) => {
        const aStarts = a.normalizedName.startsWith(term) ? 0 : 1;
        const bStarts = b.normalizedName.startsWith(term) ? 0 : 1;
        return aStarts - bStarts || a.name.localeCompare(b.name);
      })
      .slice(0, 10)
      .map((amenity) => this.toResponse(amenity));
  }

  assign(propertyId: string, dto: AssignPropertyAmenitiesDto): AmenityResponseDto[] {
    const missing = dto.amenityIds.filter((id) => !this.amenities.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(`Amenities not found: ${missing.join(', ')}`);
    }

    const assigned = this.propertyAmenities.get(propertyId) ?? new Set<string>();
    dto.amenityIds.forEach((id) => assigned.add(id));
    this.propertyAmenities.set(propertyId, assigned);

    return this.getPropertyAmenities(propertyId);
  }

  getPropertyAmenities(propertyId: string): AmenityResponseDto[] {
    const ids = this.propertyAmenities.get(propertyId);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.amenities.get(id))
      .filter((amenity): amenity is AmenityRecord => Boolean(amenity))
      .map((amenity) => this.toResponse(amenity));
  }

  private seedCatalog(): void {
    const seed: Array<[string, AmenityCategory, string]> = [
      ['Air Conditioning', AmenityCategory.INTERIOR, 'thermometer'],
      ['Hardwood Floors', AmenityCategory.INTERIOR, 'floor'],
      ['Balcony', AmenityCategory.EXTERIOR, 'building'],
      ['Private Pool', AmenityCategory.EXTERIOR, 'pool'],
      ['Fitness Center', AmenityCategory.COMMUNITY, 'dumbbell'],
      ['Clubhouse', AmenityCategory.COMMUNITY, 'users'],
      ['Gated Community', AmenityCategory.SAFETY, 'shield'],
      ['Security System', AmenityCategory.SAFETY, 'lock'],
      ['Solar Panels', AmenityCategory.UTILITY, 'sun'],
      ['EV Charging', AmenityCategory.UTILITY, 'zap'],
    ];

    for (const [name, category, icon] of seed) {
      const record: AmenityRecord = {
        id: randomUUID(),
        name,
        category,
        icon,
        isCustom: false,
        createdAt: new Date(),
        normalizedName: name.toLowerCase(),
      };
      this.amenities.set(record.id, record);
    }
  }

  private toResponse(amenity: AmenityRecord): AmenityResponseDto {
    return {
      id: amenity.id,
      name: amenity.name,
      category: amenity.category,
      icon: amenity.icon,
      description: amenity.description,
      isCustom: amenity.isCustom,
      createdAt: amenity.createdAt,
    };
  }
}
