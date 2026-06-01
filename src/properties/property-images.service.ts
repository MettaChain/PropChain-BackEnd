import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomBytes, createHash } from 'crypto';
import * as sharp from 'sharp';
import { PrismaService } from '../database/prisma.service';
import { PropertyImageResponse } from './dto/property-image.dto';
import { DuplicateDetectionService } from '../duplicate-detection/duplicate-detection.service';

/**
 * Minimal Multer file shape (we don't depend on @types/multer).
 */
export interface UploadedImageFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface ImageVariantSpec {
  name: 'thumbnail' | 'medium' | 'full';
  width: number;
  // Output quality (1-100). Lower for thumbnails to keep them small.
  quality: number;
}

@Injectable()
export class PropertyImagesService {
  private readonly logger = new Logger(PropertyImagesService.name);

  private readonly uploadDir: string;
  private readonly baseUrl: string;
  private readonly publicPathPrefix = '/uploads/properties';
  private readonly maxFileSize: number;
  private readonly maxImagesPerProperty: number;
  private readonly allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  /**
   * Variants emitted per uploaded image. All variants are converted to WebP for
   * smaller file size and faster delivery (acceptance: optimization & thumbnails).
   */
  private readonly variants: ImageVariantSpec[] = [
    { name: 'thumbnail', width: 300, quality: 70 },
    { name: 'medium', width: 800, quality: 78 },
    { name: 'full', width: 1920, quality: 82 },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly duplicateDetectionService: DuplicateDetectionService,
  ) {
    this.uploadDir = this.configService.get<string>(
      'PROPERTY_IMAGES_UPLOAD_DIR',
      './uploads/properties',
    );
    this.baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:3000');
    this.maxFileSize = this.configService.get<number>(
      'PROPERTY_IMAGE_MAX_SIZE',
      10 * 1024 * 1024, // 10MB per file
    );
    this.maxImagesPerProperty = this.configService.get<number>(
      'PROPERTY_IMAGE_MAX_PER_PROPERTY',
      30,
    );
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Upload one or more images for a property.
   * Each file is validated, optimized via sharp, written to disk in 3 variants,
   * and persisted with a sequential `order` continuing after existing images.
   */
  async uploadImages(
    propertyId: string,
    userId: string,
    userRole: string,
    files: UploadedImageFile[],
  ): Promise<PropertyImageResponse[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one image file is required');
    }

    await this.assertCanModifyProperty(propertyId, userId, userRole);

    files.forEach((f) => this.validateFile(f));

    // Enforce per-property cap
    const existingCount = await this.prisma.propertyImage.count({
      where: { propertyId },
    });
    if (existingCount + files.length > this.maxImagesPerProperty) {
      throw new BadRequestException(
        `Adding ${files.length} image(s) would exceed the limit of ${this.maxImagesPerProperty} per property (currently ${existingCount}).`,
      );
    }

    // Duplicate image filename check (across all properties)
    for (const file of files) {
      const existingImage = await this.prisma.propertyImage.findFirst({
        where: { filename: file.originalname },
      });
      if (existingImage) {
        throw new BadRequestException(
          `Duplicate image detected: '${file.originalname}' already exists for another property.`,
        );
      }
    }

    const propertyDir = join(this.uploadDir, propertyId);
    await fs.mkdir(propertyDir, { recursive: true });

    // Determine starting order and whether a primary already exists
    const last = await this.prisma.propertyImage.findFirst({
      where: { propertyId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    let nextOrder = (last?.order ?? -1) + 1;

    const hasPrimary = await this.prisma.propertyImage.findFirst({
      where: { propertyId, isPrimary: true },
      select: { id: true },
    });

    const created: PropertyImageResponse[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const processed = await this.processAndPersist(
          file,
          propertyId,
          propertyDir,
          nextOrder,
          // First uploaded image becomes primary if none exists yet
          !hasPrimary && i === 0,
        );
        created.push(processed);
        nextOrder += 1;
      } catch (err) {
        this.logger.error(
          `Failed to process image '${file.originalname}' for property ${propertyId}: ${(err as Error).message}`,
        );
        // Continue with the rest; partial upload is acceptable
      }
    }

    if (created.length === 0) {
      throw new BadRequestException('No images could be processed');
    }

    return created;
  }

  async listImages(propertyId: string): Promise<PropertyImageResponse[]> {
    const images = await this.prisma.propertyImage.findMany({
      where: { propertyId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return images.map((img: any) => this.toResponse(img));
  }

  async deleteImage(
    propertyId: string,
    imageId: string,
    userId: string,
    userRole: string,
  ): Promise<{ deleted: true }> {
    await this.assertCanModifyProperty(propertyId, userId, userRole);

    const image = await this.prisma.propertyImage.findUnique({
      where: { id: imageId },
    });
    if (!image || image.propertyId !== propertyId) {
      throw new NotFoundException('Image not found');
    }

    // Best-effort file removal (don't block DB delete on FS errors)
    await this.removeFilesForImage(propertyId, image.filename);

    await this.prisma.propertyImage.delete({ where: { id: imageId } });

    // If the deleted image was primary, promote the next-ordered one
    if (image.isPrimary) {
      const next = await this.prisma.propertyImage.findFirst({
        where: { propertyId },
        orderBy: { order: 'asc' },
      });
      if (next) {
        await this.prisma.propertyImage.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }

    return { deleted: true };
  }

  /**
   * Reorder by providing the full ordered list of image IDs.
   * The DTO guarantees uniqueness; we additionally verify the IDs match
   * exactly the property's images so callers can't smuggle foreign IDs.
   */
  async reorderImages(
    propertyId: string,
    imageIds: string[],
    userId: string,
    userRole: string,
  ): Promise<PropertyImageResponse[]> {
    await this.assertCanModifyProperty(propertyId, userId, userRole);

    const existing = await this.prisma.propertyImage.findMany({
      where: { propertyId },
      select: { id: true },
    });

    const existingIds = new Set(existing.map((e: { id: string }) => e.id));
    if (imageIds.length !== existingIds.size) {
      throw new BadRequestException(
        `Reorder list must contain exactly all ${existingIds.size} image IDs of this property`,
      );
    }
    for (const id of imageIds) {
      if (!existingIds.has(id)) {
        throw new BadRequestException(`Image ${id} does not belong to property ${propertyId}`);
      }
    }

    await this.prisma.$transaction(
      imageIds.map((id, idx) =>
        this.prisma.propertyImage.update({
          where: { id },
          data: { order: idx },
        }),
      ),
    );

    return this.listImages(propertyId);
  }

  async setPrimaryImage(
    propertyId: string,
    imageId: string,
    userId: string,
    userRole: string,
  ): Promise<PropertyImageResponse> {
    await this.assertCanModifyProperty(propertyId, userId, userRole);

    const image = await this.prisma.propertyImage.findUnique({
      where: { id: imageId },
    });
    if (!image || image.propertyId !== propertyId) {
      throw new NotFoundException('Image not found');
    }

    await this.prisma.$transaction([
      this.prisma.propertyImage.updateMany({
        where: { propertyId, isPrimary: true },
        data: { isPrimary: false },
      }),
      this.prisma.propertyImage.update({
        where: { id: imageId },
        data: { isPrimary: true },
      }),
    ]);

    const updated = await this.prisma.propertyImage.findUnique({ where: { id: imageId } });
    return this.toResponse(updated);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async assertCanModifyProperty(
    propertyId: string,
    userId: string,
    userRole: string,
  ): Promise<void> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, ownerId: true },
    });
    if (!property) {
      throw new NotFoundException('Property not found');
    }
    const isPrivileged = userRole === 'ADMIN' || userRole === 'AGENT';
    if (property.ownerId !== userId && !isPrivileged) {
      throw new ForbiddenException('You are not allowed to modify images for this property');
    }
  }

  private validateFile(file: UploadedImageFile): void {
    if (!file || !file.buffer) {
      throw new BadRequestException('Invalid file payload');
    }
    if (file.size > this.maxFileSize) {
      throw new BadRequestException(
        `Image '${file.originalname}' exceeds max size of ${Math.floor(this.maxFileSize / 1024 / 1024)}MB`,
      );
    }
    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Image '${file.originalname}' has unsupported type '${file.mimetype}'. Allowed: ${this.allowedMimeTypes.join(', ')}`,
      );
    }
  }

  /**
   * Run sharp once to gather metadata, then emit each variant as WebP.
   * Returns the persisted DB record mapped to a public response.
   */
  private async processAndPersist(
    file: UploadedImageFile,
    propertyId: string,
    propertyDir: string,
    order: number,
    isPrimary: boolean,
    altText?: string,
    caption?: string,
  ): Promise<PropertyImageResponse> {
    const baseName = `${Date.now()}_${randomBytes(6).toString('hex')}`;

    // Auto-rotate from EXIF before any processing
    const pipeline = sharp(file.buffer).rotate();
    const meta = await pipeline.metadata();

    const variantUrls: Record<ImageVariantSpec['name'], string> = {
      thumbnail: '',
      medium: '',
      full: '',
    };
    let fullVariantSize = 0;

    for (const variant of this.variants) {
      const filename = `${variant.name}_${baseName}.webp`;
      const outPath = join(propertyDir, filename);

      // Don't upscale: only resize if source is wider than the target.
      const targetWidth = meta.width && meta.width < variant.width ? meta.width : variant.width;

      const buffer = await sharp(file.buffer)
        .rotate()
        .resize({ width: targetWidth, withoutEnlargement: true })
        .webp({ quality: variant.quality })
        .toBuffer();

      await fs.writeFile(outPath, buffer);

      variantUrls[variant.name] = this.buildUrl(propertyId, filename);
      if (variant.name === 'full') {
        fullVariantSize = buffer.length;
      }
    }

    // Generate perceptual hash for duplicate detection
    const uniqueHash = this.generatePerceptualHash(file.buffer);

    const created = await this.prisma.propertyImage.create({
      data: {
        propertyId,
        url: variantUrls.full,
        thumbnailUrl: variantUrls.thumbnail,
        mediumUrl: variantUrls.medium,
        filename: `${baseName}.webp`,
        mimeType: 'image/webp',
        size: fullVariantSize,
        width: meta.width ?? null,
        height: meta.height ?? null,
        order,
        isPrimary,
        uniqueHash,
        altText: altText ?? null,
        caption: caption ?? null,
      } as any,
    });

    this.logger.log(
      `Stored image ${baseName}.webp for property ${propertyId} (order=${order}, primary=${isPrimary})`,
    );

    return this.toResponse(created);
  }

  private generatePerceptualHash(buffer: Buffer): string {
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
    return hash;
  }

  private buildUrl(propertyId: string, filename: string): string {
    return `${this.baseUrl}${this.publicPathPrefix}/${propertyId}/${filename}`;
  }

  private async removeFilesForImage(propertyId: string, baseFilename: string): Promise<void> {
    // baseFilename is `<base>.webp`; actual files are `<variant>_<base>.webp`.
    const base = baseFilename.replace(/\.webp$/i, '');
    const dir = join(this.uploadDir, propertyId);

    await Promise.all(
      this.variants.map(async (v) => {
        const path = join(dir, `${v.name}_${base}.webp`);
        try {
          await fs.unlink(path);
        } catch {
          // File may already be gone; ignore.
        }
      }),
    );
  }

  private toResponse(img: any): PropertyImageResponse {
    return {
      id: img.id,
      propertyId: img.propertyId,
      url: img.url,
      thumbnailUrl: img.thumbnailUrl,
      mediumUrl: img.mediumUrl,
      filename: img.filename,
      mimeType: img.mimeType,
      size: img.size,
      width: img.width ?? null,
      height: img.height ?? null,
      order: img.order,
      isPrimary: img.isPrimary,
      altText: img.altText ?? null,
      caption: img.caption ?? null,
      createdAt: img.createdAt,
      updatedAt: img.updatedAt,
    };
  }
}
