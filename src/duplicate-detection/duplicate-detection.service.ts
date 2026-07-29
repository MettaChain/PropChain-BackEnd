// @ts-nocheck

import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { FraudService } from '../fraud/fraud.service';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { FraudPattern, FraudSeverity } from '../types/prisma.types';
import {
  CheckDuplicateDto,
  MergeDuplicateDto,
  DuplicateCheckResult,
  DuplicateMatch,
  DuplicateType,
} from './dto/duplicate.dto';
import { UserRole } from '../types/prisma.types';

@Injectable()
export class DuplicateDetectionService {
  private readonly logger = new Logger(DuplicateDetectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fraudService: FraudService,
  ) {}

  async checkForDuplicates(dto: CheckDuplicateDto, ownerId: string): Promise<DuplicateCheckResult> {
    const { address, city, state, zipCode, country = 'USA', imageHashes } = dto;

    const matches: DuplicateMatch[] = [];

    // 1. Check for address duplicates
    const addressMatches = await this.prisma.property.findMany({
      where: {
        ownerId: { not: ownerId },
        address: { equals: address, mode: 'insensitive' },
        city: { equals: city, mode: 'insensitive' },
        state: { equals: state, mode: 'insensitive' },
        zipCode,
        country: { equals: country, mode: 'insensitive' },
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true },
        },
        images: {
          select: { id: true, url: true },
          take: 5,
        },
      },
      take: 5,
    });

    for (const prop of addressMatches) {
      matches.push({
        id: prop.id,
        type: DuplicateType.ADDRESS,
        confidenceScore: 95,
        property: {
          id: prop.id,
          title: prop.title,
          address: prop.address,
          city: prop.city,
          state: prop.state,
          zipCode: prop.zipCode,
          price: Number(prop.price),
          owner: prop.owner,
          images: prop.images,
        },
        matchedOn: ['address'],
      });
    }

    // 2. Check for image duplicates (if hashes provided)
    if (imageHashes && imageHashes.length > 0) {
      const imageMatches = await this.findSimilarImages(imageHashes, ownerId);

      for (const { property, matchedImages } of imageMatches) {
        const existingMatch = matches.find((m) => m.id === property.id);
        if (existingMatch) {
          existingMatch.type = DuplicateType.ADDRESS_AND_IMAGE;
          existingMatch.confidenceScore = Math.min(existingMatch.confidenceScore + 50, 100);
          existingMatch.matchedOn = [...new Set([...(existingMatch.matchedOn || []), 'images'])];
        } else {
          matches.push({
            id: property.id,
            type: DuplicateType.IMAGE,
            confidenceScore: 70 + matchedImages.length * 5,
            property: {
              id: property.id,
              title: property.title,
              address: property.address,
              city: property.city,
              state: property.state,
              zipCode: property.zipCode,
              price: Number(property.price),
              owner: property.owner,
              images: property.images.slice(0, 5),
            },
            matchedOn: ['images'],
          });
        }
      }
    }

    const result: DuplicateCheckResult = {
      hasDuplicates: matches.length > 0,
      matches,
    };

    if (matches.length > 0) {
      const highConfidence = matches.filter((m) => m.confidenceScore >= 80);
      if (highConfidence.length > 0) {
        result.warning = `${highConfidence.length} potential duplicate${highConfidence.length > 1 ? 's' : ''} found with high confidence. Please review before creating.`;
      } else {
        result.warning = `${matches.length} similar property${matches.length > 1 ? 'ies' : ''} found. Verify these are not duplicates.`;
      }
    }

    return result;
  }

  async recordDuplicateDetection(propertyId: string, matches: DuplicateMatch[]): Promise<void> {
    for (const match of matches) {
      const duplicateType = this.getDuplicateTypeString(match.type);

      await this.prisma.propertyDuplicate.create({
        data: {
          propertyId,
          duplicateOfId: match.id,
          duplicateType,
          confidenceScore: match.confidenceScore,
          evidence: {
            matchedOn: match.matchedOn,
            matchedImageIds: match.property.images?.map((i) => i.id),
          },
        },
      });
    }
  }

  async mergeProperties(
    dto: MergeDuplicateDto,
    actorId: string,
    actorRole: UserRole | string,
  ): Promise<{ merged: true; survivingPropertyId: string; mergedPropertyId: string }> {
    const { keepPropertyId, discardPropertyId } = dto;

    const keepProperty = await this.prisma.property.findUnique({
      where: { id: keepPropertyId },
    });
    const discardProperty = await this.prisma.property.findUnique({
      where: { id: discardPropertyId },
    });

    if (!keepProperty) {
      throw new NotFoundException('Property to keep not found');
    }
    if (!discardProperty) {
      throw new NotFoundException('Property to merge not found');
    }

    const isKeepOwner = keepProperty.ownerId === actorId;
    const isDiscardOwner = discardProperty.ownerId === actorId;
    const isPrivileged = actorRole === UserRole.ADMIN || actorRole === UserRole.AGENT;

    if (!isKeepOwner && !isDiscardOwner && !isPrivileged) {
      throw new ForbiddenException('You do not have permission to merge these properties');
    }

    // Merge images from discard into keep
    const discardImages = await this.prisma.propertyImage.findMany({
      where: { propertyId: discardPropertyId },
    });

    const keepImageOrder = await this.prisma.propertyImage.findFirst({
      where: { propertyId: keepPropertyId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const nextOrder = (keepImageOrder?.order ?? -1) + 1;

    for (let i = 0; i < discardImages.length; i++) {
      const img = discardImages[i];
      await this.prisma.propertyImage.update({
        where: { id: img.id },
        data: {
          propertyId: keepPropertyId,
          order: nextOrder + i,
        },
      });
    }

    // Merge features (combine unique)
    const mergedFeatures = [
      ...new Set([...(keepProperty.features || []), ...(discardProperty.features || [])]),
    ];

    // Create merged property with updated data
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const mergedProperty = await this.prisma.property.update({
      where: { id: keepPropertyId },
      data: {
        features: mergedFeatures,
        viewCount: keepProperty.viewCount + discardProperty.viewCount,
      },
    });

    // Record the merge
    await this.prisma.propertyDuplicate.create({
      data: {
        propertyId: discardPropertyId,
        duplicateOfId: keepPropertyId,
        duplicateType: DuplicateType.ADDRESS_AND_IMAGE,
        confidenceScore: 100,
        isMerged: true,
        mergedIntoId: keepPropertyId,
        evidence: {
          mergedBy: actorId,
          mergeAction: 'merge_properties',
        },
      },
    });

    // Soft delete the discard property by archiving it
    await this.prisma.property.update({
      where: { id: discardPropertyId },
      data: {
        status: 'ARCHIVED',
      },
    });

    this.logger.log(`Merged property ${discardPropertyId} into ${keepPropertyId} by ${actorId}`);

    return {
      merged: true,
      survivingPropertyId: keepPropertyId,
      mergedPropertyId: discardPropertyId,
    };
  }

  // ---- Flagging workflow (#553) ----

  async flagForReview(
    propertyId: string,
    duplicateOfId: string | undefined,
    reviewNotes?: string,
  ): Promise<any> {
    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const record = await this.prisma.propertyDuplicate.create({
      data: {
        propertyId,
        duplicateOfId: duplicateOfId ?? null,
        duplicateType: 'FLAGGED',
        confidenceScore: 0,
        flaggedForReview: true,
        reviewNotes: reviewNotes ?? null,
      } as any,
    });

    this.logger.log(
      `Property ${propertyId} flagged for duplicate review. Notes: ${reviewNotes ?? 'none'}`,
    );

    return record;
  }

  async getFlags(): Promise<any[]> {
    return this.prisma.propertyDuplicate.findMany({
      where: { flaggedForReview: true, isMerged: false, isResolved: false },
      include: {
        property: {
          select: { id: true, title: true, address: true, city: true, state: true },
        },
        duplicateOf: {
          select: { id: true, title: true, address: true, city: true, state: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async resolveFlag(flagId: string): Promise<any> {
    const flag = await this.prisma.propertyDuplicate.findUnique({
      where: { id: flagId },
    });
    if (!flag) {
      throw new NotFoundException('Duplicate flag not found');
    }
    return this.prisma.propertyDuplicate.update({
      where: { id: flagId },
      data: { isResolved: true },
    });
  }

  // ---------- Issue #936: Enhanced Duplicate Detection ----------

  async detectTextSimilarity(
    propertyA: { description?: string | null; features?: string[] | null },
    propertyB: { description?: string | null; features?: string[] | null },
  ): Promise<{ score: number; matchedTerms: string[] }> {
    const tokenize = (text: string | null | undefined): Set<string> => {
      if (!text) return new Set();
      return new Set(
        text
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .split(/\s+/)
          .filter((t) => t.length > 2),
      );
    };

    const tokensA = tokenize(propertyA.description);
    const tokensB = tokenize(propertyB.description);

    const featuresA = new Set((propertyA.features || []).map((f) => f.toLowerCase()));
    const featuresB = new Set((propertyB.features || []).map((f) => f.toLowerCase()));

    const allTermsA = new Set([...tokensA, ...featuresA]);
    const allTermsB = new Set([...tokensB, ...featuresB]);

    const intersection = new Set([...allTermsA].filter((t) => allTermsB.has(t)));
    const union = new Set([...allTermsA, ...allTermsB]);

    const score = union.size === 0 ? 0 : Math.round((intersection.size / union.size) * 100);

    return {
      score,
      matchedTerms: Array.from(intersection),
    };
  }

  async findNearbyDuplicates(propertyId: string, radiusMeters: number = 500): Promise<any[]> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { latitude: true, longitude: true },
    });

    if (!property?.latitude || !property?.longitude) {
      return [];
    }

    const latDelta = radiusMeters / 111000;
    const lngDelta = radiusMeters / (111000 * Math.cos((property.latitude * Math.PI) / 180));

    const nearby = await this.prisma.property.findMany({
      where: {
        id: { not: propertyId },
        latitude: {
          gte: property.latitude - latDelta,
          lte: property.latitude + latDelta,
        },
        longitude: {
          gte: property.longitude - lngDelta,
          lte: property.longitude + lngDelta,
        },
      },
      select: {
        id: true,
        title: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        price: true,
        latitude: true,
        longitude: true,
      },
      take: 20,
    });

    return nearby;
  }

  calculateConfidence(signals: {
    addressMatch?: boolean;
    imageSimilarity?: number;
    textSimilarity?: number;
    weights?: { address?: number; image?: number; text?: number };
  }): number {
    const w = {
      address: signals.weights?.address ?? 0.4,
      image: signals.weights?.image ?? 0.35,
      text: signals.weights?.text ?? 0.25,
    };

    let score = 0;
    if (signals.addressMatch) score += 100 * w.address;
    if (signals.imageSimilarity != null) score += signals.imageSimilarity * w.image;
    if (signals.textSimilarity != null) score += signals.textSimilarity * w.text;

    return Math.round(Math.min(100, score));
  }

  async detectBatchDuplicates(
    propertyIds: string[],
  ): Promise<Map<string, { matches: any[]; confidence: number }>> {
    const results = new Map<string, { matches: any[]; confidence: number }>();

    for (const propId of propertyIds) {
      const property = await this.prisma.property.findUnique({
        where: { id: propId },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          images: { select: { id: true, url: true }, take: 5 },
        },
      });

      if (!property) continue;

      const matches: any[] = [];

      // Address match
      const addressMatches = await this.prisma.property.findMany({
        where: {
          id: { not: propId },
          address: { equals: property.address, mode: 'insensitive' },
          city: { equals: property.city, mode: 'insensitive' },
          state: { equals: property.state, mode: 'insensitive' },
          zipCode: property.zipCode,
        },
        take: 5,
      });

      for (const m of addressMatches) {
        matches.push({ id: m.id, type: 'ADDRESS', address: m.address });
      }

      // Nearby duplicates
      const nearby = await this.findNearbyDuplicates(propId, 500);
      for (const n of nearby) {
        if (!matches.find((m: any) => m.id === n.id)) {
          matches.push({ id: n.id, type: 'NEARBY', address: n.address });
        }
      }

      const confidence =
        matches.length > 0
          ? this.calculateConfidence({
              addressMatch: matches.some((m: any) => m.type === 'ADDRESS'),
            })
          : 0;

      results.set(propId, { matches, confidence });
    }

    return results;
  }

  async getDuplicateStats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
  }> {
    const total = await this.prisma.propertyDuplicate.count();

    const records = await this.prisma.propertyDuplicate.findMany({
      select: {
        isMerged: true,
        isResolved: true,
        flaggedForReview: true,
        duplicateType: true,
      },
    });

    const byStatus: Record<string, number> = {
      PENDING: 0,
      REVIEWED: 0,
      MERGED: 0,
      DISMISSED: 0,
    };

    const byType: Record<string, number> = {};

    for (const r of records) {
      if (r.isMerged) {
        byStatus.MERGED++;
      } else if (r.isResolved) {
        byStatus.DISMISSED++;
      } else if (r.flaggedForReview) {
        byStatus.PENDING++;
      } else {
        byStatus.REVIEWED++;
      }

      byType[r.duplicateType] = (byType[r.duplicateType] || 0) + 1;
    }

    return { total, byStatus, byType };
  }

  private async findSimilarImages(
    hashes: string[],
    excludeOwnerId: string,
  ): Promise<Array<{ property: any; matchedImages: string[] }>> {
    const matchingImages = await this.prisma.propertyImage.findMany({
      where: {
        uniqueHash: { in: hashes },
        property: {
          ownerId: { not: excludeOwnerId },
        },
      },
      include: {
        property: {
          include: {
            owner: { select: { id: true, firstName: true, lastName: true } },
            images: { select: { id: true, url: true } },
          },
        },
      },
    });

    const propertyMatches = new Map<string, { property: any; matchedImages: string[] }>();
    for (const img of matchingImages) {
      if (!propertyMatches.has(img.propertyId)) {
        propertyMatches.set(img.propertyId, {
          property: img.property,
          matchedImages: [],
        });
      }
      propertyMatches.get(img.propertyId)!.matchedImages.push(img.id);
    }

    return Array.from(propertyMatches.values());
  }

  private getDuplicateTypeString(type: DuplicateType): string {
    switch (type) {
      case DuplicateType.ADDRESS:
        return 'ADDRESS';
      case DuplicateType.IMAGE:
        return 'IMAGE';
      case DuplicateType.ADDRESS_AND_IMAGE:
        return 'ADDRESS_AND_IMAGE';
    }
  }
}
