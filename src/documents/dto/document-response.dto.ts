import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType, DocumentAccessLevel, DocumentStatus } from '../document.model';

export class DocumentVersionDto {
  @ApiProperty({
    description: 'Version number',
    example: 1,
  })
  version: number;

  @ApiProperty({
    description: 'Storage key for the file',
    example: 'documents/abc123/v1.pdf',
  })
  storageKey: string;

  @ApiProperty({
    description: 'File checksum',
    example: 'sha256:abc123...',
  })
  checksum: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 1024000,
  })
  size: number;

  @ApiProperty({
    description: 'File MIME type',
    example: 'application/pdf',
  })
  mimeType: string;

  @ApiProperty({
    description: 'Upload timestamp',
    example: '2024-01-15T08:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'User who uploaded this version',
    example: 'user_abc123',
  })
  uploadedBy: string;

  @ApiProperty({
    description: 'Original file name',
    example: 'deed.pdf',
  })
  originalFileName: string;

  @ApiPropertyOptional({
    description: 'Thumbnail storage key',
    example: 'thumbnails/abc123/v1.png',
  })
  thumbnailKey?: string;
}

export class DocumentMetadataResponseDto {
  @ApiPropertyOptional({
    description: 'Associated property ID',
    example: 'prop_abc123',
  })
  propertyId?: string;

  @ApiProperty({
    description: 'Document title',
    example: 'Property Deed 2024',
  })
  title: string;

  @ApiPropertyOptional({
    description: 'Document description',
    example: 'Official property deed document',
  })
  description?: string;

  @ApiProperty({
    description: 'Document tags',
    example: ['legal', 'deed', '2024'],
    type: [String],
  })
  tags: string[];

  @ApiProperty({
    description: 'User who uploaded the document',
    example: 'user_abc123',
  })
  uploadedBy: string;

  @ApiProperty({
    description: 'Document access level',
    enum: DocumentAccessLevel,
    example: DocumentAccessLevel.PRIVATE,
  })
  accessLevel: DocumentAccessLevel;

  @ApiProperty({
    description: 'User IDs allowed to access',
    example: ['user1', 'user2'],
    type: [String],
  })
  allowedUserIds: string[];

  @ApiProperty({
    description: 'Roles allowed to access',
    example: ['ADMIN', 'AGENT'],
    type: [String],
  })
  allowedRoles: string[];

  @ApiProperty({
    description: 'Custom metadata fields',
    example: { category: 'legal' },
  })
  customFields: Record<string, string>;
}

export class DocumentResponseDto {
  @ApiProperty({
    description: 'Document unique identifier',
    example: 'doc_abc123',
  })
  id: string;

  @ApiProperty({
    description: 'Document type',
    enum: DocumentType,
    example: DocumentType.DEED,
  })
  type: DocumentType;

  @ApiProperty({
    description: 'Document metadata',
    type: DocumentMetadataResponseDto,
  })
  metadata: DocumentMetadataResponseDto;

  @ApiProperty({
    description: 'Document versions',
    type: [DocumentVersionDto],
  })
  versions: DocumentVersionDto[];

  @ApiProperty({
    description: 'Current version number',
    example: 1,
  })
  currentVersion: number;

  @ApiProperty({
    description: 'Document status',
    enum: DocumentStatus,
    example: DocumentStatus.ACTIVE,
  })
  status: DocumentStatus;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-01-15T08:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2024-01-22T09:00:00.000Z',
  })
  updatedAt: Date;
}

export class DownloadUrlResponseDto {
  @ApiProperty({
    description: 'Signed download URL',
    example: 'https://storage.example.com/documents/abc123?signature=...',
  })
  url: string;

  @ApiProperty({
    description: 'URL expiration time in seconds',
    example: 3600,
  })
  expiresIn: number;
}
