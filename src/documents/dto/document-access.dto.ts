// @ts-nocheck

import { IsOptional, IsString, IsUUID, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class DownloadDocumentDto {
  @ApiPropertyOptional({
    description: 'Optional document version ID to download a specific version',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  versionId?: string;
}

export class RequestSignedUploadDto {
  @ApiPropertyOptional({ description: 'Property ID the document belongs to', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional({
    description: 'Transaction ID the document is associated with',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  transactionId?: string;

  @ApiProperty({ description: 'Original file name', example: 'contract.pdf' })
  @IsString()
  fileName: string;

  @ApiProperty({ description: 'MIME type of the file', example: 'application/pdf' })
  @IsString()
  mimeType: string;

  @ApiProperty({ description: 'File size in bytes', example: 102400 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  fileSizeBytes: number;

  @ApiPropertyOptional({
    description: 'Existing document ID when replacing a document',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  documentId?: string;

  @ApiPropertyOptional({ description: 'Document category', example: 'CONTRACT' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Document description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Dispute ID the document is linked to', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  disputeId?: string;
}

export class SignedUploadUrlResponseDto {
  @ApiProperty({ description: 'Pre-signed URL for direct client upload' })
  url: string;

  @ApiProperty({ description: 'Object storage key for the uploaded file' })
  objectKey: string;

  @ApiProperty({
    description: 'Expiration time of the signed URL',
    type: String,
    format: 'date-time',
  })
  expiresAt: Date;
}
