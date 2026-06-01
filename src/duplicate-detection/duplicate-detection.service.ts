import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { FraudService } from '../fraud/fraud.service';
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
    return (this.prisma as any).propertyDuplicate.findMany({
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
    const flag = await (this.prisma as any).propertyDuplicate.findUnique({
      where: { id: flagId },
    });
    if (!flag) {
      throw new NotFoundException('Duplicate flag not found');
    }
    return (this.prisma as any).propertyDuplicate.update({
      where: { id: flagId },
      data: { isResolved: true },
    });
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
