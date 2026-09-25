import { ForbiddenException, Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { isAbsolute, join, relative, resolve } from 'path';
import { createHash } from 'crypto';
import { matchesMagicBytes } from '../common/security/magic-bytes';
import sharp from 'sharp';

// Multer type definition
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}

@Injectable()
export class AvatarUploadService {
  private readonly logger = new Logger(AvatarUploadService.name);
  private readonly uploadDir: string;
  private readonly baseUrl: string;
  private readonly maxFileSize: number;
  private readonly allowedMimeTypes: string[];
  private readonly avatarSizes: { small: number; medium: number; large: number };

  constructor(private configService: ConfigService) {
    this.uploadDir = this.configService.get<string>('AVATAR_UPLOAD_DIR', './uploads/avatars');
    this.baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:3000');
    this.maxFileSize = this.configService.get<number>('AVATAR_MAX_FILE_SIZE', 5 * 1024 * 1024); // 5MB
    this.allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    this.avatarSizes = {
      small: 64,
      medium: 128,
      large: 256,
    };
  }

  async uploadAvatar(
    userId: string,
    file: MulterFile,
  ): Promise<{
    avatarUrl: string;
    sizes: { small: string; medium: string; large: string };
  }> {
    // Validate file
    this.validateFile(file);

    // Ensure upload directory exists
    await this.ensureUploadDirectory();

    // Generate unique filename
    const fileHash = this.generateFileHash(file.buffer);
    const filename = `${userId}_${fileHash}.${this.getFileExtension(file.mimetype)}`;

    // Create user-specific directory
    const userDir = join(this.uploadDir, userId);
    const resolvedUserDir = resolve(userDir);
    await fs.mkdir(userDir, { recursive: true });

    // Save original file
    const originalPath = join(userDir, filename);
    const resolvedOriginalPath = resolve(originalPath);
    if (!resolvedOriginalPath.startsWith(resolvedUserDir)) {
      throw new ForbiddenException('Avatar path traversal not allowed');
    }
    await fs.writeFile(resolvedOriginalPath, file.buffer);

    // Generate the actual resized variants so returned URLs represent usable sizes.
    await this.generateAvatarSizes(originalPath, userDir, filename);

    // Generate URLs
    const avatarUrl = `${this.baseUrl}/uploads/avatars/${userId}/${filename}`;
    const sizeUrls = {
      small: `${this.baseUrl}/uploads/avatars/${userId}/small_${filename}`,
      medium: `${this.baseUrl}/uploads/avatars/${userId}/medium_${filename}`,
      large: `${this.baseUrl}/uploads/avatars/${userId}/large_${filename}`,
    };

    this.logger.log(`Avatar uploaded successfully for user ${userId}`);

    return {
      avatarUrl,
      sizes: sizeUrls,
    };
  }

  async deleteAvatar(userId: string, filename: string): Promise<void> {
    const userDir = join(this.uploadDir, userId);
    const resolvedUserDir = resolve(userDir);

    if (!/^[A-Za-z0-9._-]+$/.test(filename)) {
      throw new BadRequestException('Invalid filename');
    }

    try {
      // Delete all size variants
      const sizes = ['small_', 'medium_', 'large_', ''];
      for (const prefix of sizes) {
        const filePath = join(userDir, `${prefix}${filename}`);
        const resolvedFilePath = resolve(filePath);
        const normalizedRelativePath = relative(resolvedUserDir, resolvedFilePath);

        if (
          normalizedRelativePath.startsWith('..') ||
          isAbsolute(normalizedRelativePath) ||
          normalizedRelativePath === ''
        ) {
          throw new BadRequestException('Invalid filename');
        }

        try {
          await fs.unlink(resolvedFilePath);
        } catch (error) {
          // File might not exist, continue
        }
      }

      // Try to remove user directory if empty
      try {
        await fs.rmdir(userDir);
      } catch (error) {
        // Directory not empty, continue
      }

      this.logger.log(`Avatar deleted successfully for user ${userId}`);
    } catch (error) {
      this.logger.error(`Error deleting avatar for user ${userId}:`, error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to delete avatar');
    }
  }

  private validateFile(file: MulterFile): void {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Check file size
    if (file.size > this.maxFileSize) {
      throw new BadRequestException(
        `File size exceeds maximum allowed size of ${this.maxFileSize / 1024 / 1024}MB`,
      );
    }

    // Check MIME type
    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${this.allowedMimeTypes.join(', ')}`,
      );
    }

    // Check file extension
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const fileExtension = this.getFileExtension(file.mimetype);
    if (!allowedExtensions.includes(`.${fileExtension}`)) {
      throw new BadRequestException(
        `Invalid file extension. Allowed extensions: ${allowedExtensions.join(', ')}`,
      );
    }

    // Content sniffing (magic bytes) - reject spoofed extensions. Multer only
    // exposes a buffer when uploads are configured with `memoryStorage`;
    // degrade gracefully when it does not.
    if (file.buffer && file.buffer.length > 0 && !matchesMagicBytes(file.buffer, file.mimetype)) {
      throw new BadRequestException(
        `File content does not match declared type '${file.mimetype}'. Allowed: ${this.allowedMimeTypes.join(', ')}`,
      );
    }
  }

  private async ensureUploadDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
    } catch (error) {
      this.logger.error('Error creating upload directory:', error);
      throw new BadRequestException('Failed to create upload directory');
    }
  }

  private generateFileHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex').substring(0, 16);
  }

  private getFileExtension(mimetype: string): string {
    const mimeToExt: { [key: string]: string } = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    return mimeToExt[mimetype] || 'jpg';
  }

  private async generateAvatarSizes(
    originalPath: string,
    userDir: string,
    filename: string,
  ): Promise<{ small: string; medium: string; large: string }> {
    const sizes = { small: 64, medium: 128, large: 256 };
    const result: { small: string; medium: string; large: string } = {
      small: '',
      medium: '',
      large: '',
    };

    for (const [size, width] of Object.entries(sizes)) {
      const sizePath = join(userDir, `${size}_${filename}`);
      try {
        await sharp(originalPath).resize({ width, height: width, fit: 'cover' }).toFile(sizePath);
        result[size as keyof typeof result] = sizePath;
      } catch (error) {
        this.logger.error(`Error creating ${size} avatar size:`, error);
        // Continue with other sizes
      }
    }

    return result;
  }

  async getAvatarUrl(userId: string, filename: string): Promise<string> {
    return `${this.baseUrl}/uploads/avatars/${userId}/${filename}`;
  }
}
