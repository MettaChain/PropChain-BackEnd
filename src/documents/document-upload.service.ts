import { Injectable, BadRequestException } from '@nestjs/common';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

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
  validate(request: UploadRequest): void {
    if (!ALLOWED_MIME_TYPES.has(request.mimeType)) {
      throw new BadRequestException(`Unsupported file type: ${request.mimeType}`);
    }
    if (request.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File exceeds maximum allowed size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB`,
      );
    }
    if (!request.fileName.trim()) {
      throw new BadRequestException('File name cannot be empty');
    }
  }

  prepareMetadata(request: UploadRequest): UploadMetadata {
    this.validate(request);
    const sanitisedName = request.fileName
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .toLowerCase();

    return {
      ...request,
      sanitisedName,
      uploadedAt: new Date().toISOString(),
    };
  }
}
