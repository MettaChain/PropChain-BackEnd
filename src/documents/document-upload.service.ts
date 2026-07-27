// @ts-nocheck

import { Injectable, BadRequestException, Logger } from '@nestjs/common';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const MIME_SIZE_LIMITS: Record<string, number> = {
  'image/jpeg': 10 * 1024 * 1024,
  'image/png': 10 * 1024 * 1024,
  'image/webp': 10 * 1024 * 1024,
  'image/avif': 10 * 1024 * 1024,
  'application/pdf': 25 * 1024 * 1024,
  'application/msword': 15 * 1024 * 1024,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 15 * 1024 * 1024,
};

const MAGIC_BYTES: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  'image/avif': [[0x00, 0x00, 0x00]],
};

const THREAT_PATTERNS = [
  /<script[\s>]/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /<iframe[\s>]/i,
  /<object[\s>]/i,
  /<embed[\s>]/i,
  /<applet[\s>]/i,
];

export interface UploadRequest {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
}

export interface UploadMetadata {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  sanitisedName: string;
  uploadedAt: string;
}

@Injectable()
export class DocumentUploadService {
  private readonly logger = new Logger(DocumentUploadService.name);

  validate(request: UploadRequest): void {
    if (!ALLOWED_MIME_TYPES.has(request.mimeType)) {
      throw new BadRequestException(`Unsupported file type: ${request.mimeType}`);
    }
    if (request.fileSizeBytes <= 0) {
      throw new BadRequestException('File size must be greater than zero');
    }
    const limit = MIME_SIZE_LIMITS[request.mimeType] ?? 10 * 1024 * 1024;
    if (request.fileSizeBytes > limit) {
      throw new BadRequestException(
        `File exceeds maximum allowed size of ${Math.round(limit / (1024 * 1024))} MB for ${request.mimeType}`,
      );
    }
    if (!request.fileName.trim()) {
      throw new BadRequestException('File name cannot be empty');
    }
  }

  prepareMetadata(request: UploadRequest): UploadMetadata {
    this.validate(request);
    const sanitisedName = this.sanitizeFilename(request.fileName);

    return {
      ...request,
      sanitisedName,
      uploadedAt: new Date().toISOString(),
    };
  }

  /**
   * Validate file signature (magic bytes) against the expected MIME type.
   */
  validateMagicBytes(buffer: Buffer, expectedMime: string): boolean {
    const signatures = MAGIC_BYTES[expectedMime];
    if (!signatures) {
      return true;
    }
    for (const sig of signatures) {
      if (buffer.length < sig.length) {
        continue;
      }
      let match = true;
      for (let i = 0; i < sig.length; i++) {
        if (buffer[i] !== sig[i]) {
          match = false;
          break;
        }
      }
      if (match) {
        return true;
      }
    }
    return false;
  }

  /**
   * Enhanced filename sanitization with path traversal prevention.
   */
  sanitizeFilename(filename: string): string {
    let name = filename.trim();
    name = name.replace(/\0/g, '');
    name = name.replace(/\.\./g, '');
    name = name.replace(/[/\\]/g, '');
    name = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    name = name.replace(/_{2,}/g, '_');
    name = name.replace(/^[._-]+/, '');
    if (!name || name.length === 0) {
      name = `upload_${Date.now()}`;
    }
    return name.toLowerCase();
  }

  /**
   * Validate file size against type-specific limits.
   */
  validateFileSize(buffer: Buffer, mimeType: string): void {
    const limit = MIME_SIZE_LIMITS[mimeType] ?? 10 * 1024 * 1024;
    if (buffer.length > limit) {
      throw new BadRequestException(
        `File size ${Math.round(buffer.length / (1024 * 1024))}MB exceeds limit of ${Math.round(limit / (1024 * 1024))}MB for ${mimeType}`,
      );
    }
  }

  /**
   * Basic malware/threat scan looking for embedded scripts and suspicious patterns.
   */
  scanForThreats(buffer: Buffer): { safe: boolean; reason?: string } {
    const content = buffer.toString('utf-8', 0, Math.min(buffer.length, 1024 * 1024));
    for (const pattern of THREAT_PATTERNS) {
      if (pattern.test(content)) {
        this.logger.warn(`Threat pattern detected: ${pattern.source}`);
        return { safe: false, reason: `Potentially dangerous pattern detected: ${pattern.source}` };
      }
    }
    return { safe: true };
  }
}
