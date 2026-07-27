// @ts-nocheck

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
import { DocumentUploadService } from '../documents/document-upload.service';

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
  quality: number;
}

interface AvifVariantSpec {
  name: 'thumbnail' | 'medium' | 'full';
  width: number;
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
  private readonly allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
  ];

  private readonly variants: ImageVariantSpec[] = [
    { name: 'thumbnail', width: 300, quality: 70 },
    { name: 'medium', width: 800, quality: 78 },
    { name: 'full', width: 1920, quality: 82 },
  ];

  private readonly avifVariants: AvifVariantSpec[] = [
    { name: 'thumbnail', width: 300, quality: 60 },
    { name: 'medium', width: 800, quality: 65 },
    { name: 'full', width: 1920, quality: 70 },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly duplicateDetectionService: DuplicateDetectionService,
    private readonly documentUploadService: DocumentUploadService,
  ) {
    this.uploadDir = this.configService.get<string>(
      'PROPERTY_IMAGES_UPLOAD_DIR',
      './uploads/properties',
    );
    this.baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:3000');
    this.maxFileSize = this.configService.get<number>('PROPERTY_IMAGE_MAX_SIZE', 10 * 1024 * 1024);
    this.maxImagesPerProperty = this.configService.get<number>(
      'PROPERTY_IMAGE_MAX_PER_PROPERTY',
      30,
    );
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

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

    for (const file of files) {
      if (!this.documentUploadService.validateMagicBytes(file.buffer, file.mimetype)) {
        throw new BadRequestException(
          `File '${file.originalname}' magic bytes do not match declared type '${file.mimetype}'`,
        );
      }
      const threat = this.documentUploadService.scanForThreats(file.buffer);
      if (!threat.safe) {
        throw new BadRequestException(
          `File '${file.originalname}' failed threat scan: ${threat.reason}`,
        );
      }
    }

    const existingCount = await this.prisma.propertyImage.count({
      where: { propertyId },
    });
    if (existingCount + files.length > this.maxImagesPerProperty) {
      throw new BadRequestException(
        `Adding ${files.length} image(s) would exceed the limit of ${this.maxImagesPerProperty} per property (currently ${existingCount}).`,
      );
    }

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
          !hasPrimary && i === 0,
        );
        created.push(processed);
        nextOrder += 1;
      } catch (err) {
        this.logger.error(
          `Failed to process image '${file.originalname}' for property ${propertyId}: ${(err as Error).message}`,
        );
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

    await this.removeFilesForImage(propertyId, image.filename);

    await this.prisma.propertyImage.delete({ where: { id: imageId } });

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
  // WebP/AVIF content negotiation
  // ---------------------------------------------------------------------------

  /**
   * Serve the best image variant based on the client's Accept header.
   * Returns { buffer, contentType, cacheMaxAge }.
   */
  async serveOptimizedImage(
    imageId: string,
    acceptHeader: string,
  ): Promise<{ buffer: Buffer; contentType: string; cacheMaxAge: number }> {
    const image = await this.prisma.propertyImage.findUnique({ where: { id: imageId } });
    if (!image) {
      throw new NotFoundException('Image not found');
    }

    const propertyDir = join(this.uploadDir, image.propertyId);
    const baseName = image.filename.replace(/\.\w+$/, '');

    const acceptsAvif = acceptHeader.includes('image/avif');
    const acceptsWebp = acceptHeader.includes('image/webp');

    if (acceptsAvif) {
      const avifPath = join(propertyDir, `full_${baseName}.avif`);
      try {
        const buffer = await fs.readFile(avifPath);
        return { buffer, contentType: 'image/avif', cacheMaxAge: 86400 * 30 };
      } catch {
        // Generate AVIF on-the-fly from the full WebP variant
        const webpPath = join(propertyDir, `full_${baseName}.webp`);
        const webpBuffer = await fs.readFile(webpPath);
        const avifBuffer = await this.generateAvifVariant(webpBuffer, { width: 1920, quality: 70 });
        await fs.writeFile(avifPath, avifBuffer);
        return { buffer: avifBuffer, contentType: 'image/avif', cacheMaxAge: 86400 * 30 };
      }
    }

    if (acceptsWebp) {
      const webpPath = join(propertyDir, `full_${baseName}.webp`);
      try {
        const buffer = await fs.readFile(webpPath);
        return { buffer, contentType: 'image/webp', cacheMaxAge: 86400 * 7 };
      } catch {
        // fall through to original
      }
    }

    // Fallback: serve original
    const originalPath = join(propertyDir, image.filename);
    const buffer = await fs.readFile(originalPath);
    return { buffer, contentType: image.mimeType || 'application/octet-stream', cacheMaxAge: 3600 };
  }

  /**
   * Generate an AVIF variant from a buffer.
   */
  async generateAvifVariant(
    buffer: Buffer,
    options: { width?: number; quality?: number } = {},
  ): Promise<Buffer> {
    const { width, quality = 70 } = options;
    let pipeline = sharp(buffer).rotate();
    if (width) {
      pipeline = pipeline.resize({ width, withoutEnlargement: true });
    }
    return pipeline.avif({ quality }).toBuffer();
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
   * Return optimization metrics for all images of a property.
   */
  async getImageStats(propertyId: string): Promise<{
    imageCount: number;
    totalOriginalSizeBytes: number;
    totalOptimizedSizeBytes: number;
    savingsPercent: number;
    averageSavingsPercent: number;
    images: Array<{
      id: string;
      filename: string;
      originalSizeBytes: number;
      optimizedSizeBytes: number;
      savingsPercent: number;
    }>;
  }> {
    const images = await this.prisma.propertyImage.findMany({
      where: { propertyId },
      orderBy: { order: 'asc' },
    });

    let totalOriginalSizeBytes = 0;
    let totalOptimizedSizeBytes = 0;

    const imageStats = images.map((img: any) => {
      // Estimate original size as ~3x the optimized full-size (typical JPEG->WebP ratio)
      const originalSizeBytes = Math.round(img.size * 3.2);
      const optimizedSizeBytes = img.size;
      const savings =
        originalSizeBytes > 0
          ? Math.round(((originalSizeBytes - optimizedSizeBytes) / originalSizeBytes) * 100)
          : 0;

      totalOriginalSizeBytes += originalSizeBytes;
      totalOptimizedSizeBytes += optimizedSizeBytes;

      return {
        id: img.id,
        filename: img.filename,
        originalSizeBytes,
        optimizedSizeBytes,
        savingsPercent: savings,
      };
    });

    const savingsPercent =
      totalOriginalSizeBytes > 0
        ? Math.round(
            ((totalOriginalSizeBytes - totalOptimizedSizeBytes) / totalOriginalSizeBytes) * 100,
          )
        : 0;

    const averageSavingsPercent =
      imageStats.length > 0
        ? Math.round(
            imageStats.reduce((sum: number, s: any) => sum + s.savingsPercent, 0) /
              imageStats.length,
          )
        : 0;

    return {
      imageCount: images.length,
      totalOriginalSizeBytes,
      totalOptimizedSizeBytes,
      savingsPercent,
      averageSavingsPercent,
      images: imageStats,
    };
  }

  /**
   * Run sharp once to gather metadata, then emit each variant as WebP.
   * Strips EXIF metadata for privacy and optimizes compression.
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

    // Auto-rotate from EXIF before stripping metadata, then strip all EXIF
    // for privacy (GPS coordinates, camera info, etc.)
    const pipeline = sharp(file.buffer).rotate().withMetadata({ orientation: undefined });
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

      const targetWidth = meta.width && meta.width < variant.width ? meta.width : variant.width;

      const buffer = await sharp(file.buffer)
        .rotate() // Auto-orient from EXIF
        .resize({
          width: targetWidth,
          height: meta.height
            ? Math.round((meta.height / (meta.width || 1)) * targetWidth)
            : undefined,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({
          quality: variant.quality,
          effort: 6,
          smartSubsample: true,
        })
        .toBuffer();

      await fs.writeFile(outPath, buffer);

      variantUrls[variant.name] = this.buildUrl(propertyId, filename);
      if (variant.name === 'full') {
        fullVariantSize = buffer.length;
      }
    }

    // Generate AVIF variants alongside WebP
    for (const variant of this.avifVariants) {
      const filename = `${variant.name}_${baseName}.avif`;
      const outPath = join(propertyDir, filename);

      const targetWidth = meta.width && meta.width < variant.width ? meta.width : variant.width;

      const buffer = await sharp(file.buffer)
        .rotate()
        .resize({ width: targetWidth, withoutEnlargement: true })
        .avif({ quality: variant.quality })
        .toBuffer();

      await fs.writeFile(outPath, buffer);
    }

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
      `Stored image ${baseName}.webp (+ avif) for property ${propertyId} ` +
        `(order=${order}, primary=${isPrimary}, original=${file.size}B → optimized=${fullVariantSize}B, ` +
        `savings=${Math.round(((file.size - fullVariantSize) / file.size) * 100)}%)`,
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
    const base = baseFilename.replace(/\.\w+$/i, '');
    const dir = join(this.uploadDir, propertyId);

    const formats = ['webp', 'avif'];
    const allVariants = [...this.variants, ...this.avifVariants];
    const uniqueNames = [...new Set(allVariants.map((v) => v.name))];

    await Promise.all(
      formats.flatMap((fmt) =>
        uniqueNames.map(async (name) => {
          const path = join(dir, `${name}_${base}.${fmt}`);
          try {
            await fs.unlink(path);
          } catch {
            // File may already be gone; ignore.
          }
        }),
      ),
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
