// @ts-nocheck

import { IsString, IsOptional, IsArray, IsDateString, IsBoolean, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const DOCUMENT_TYPE_ENUM = [
  'TITLE_DEED',
  'INSPECTION_REPORT',
  'APPRAISAL',
  'CONTRACT',
  'DISCLOSURE',
  'PHOTO',
  'FLOOR_PLAN',
] as const;

export class CreateDocumentDto {
  @IsOptional()
  @IsString()
  propertyId?: string;

  @IsIn(DOCUMENT_TYPE_ENUM)
  documentType: string;

  @IsString()
  fileName: string;

  @IsString()
  fileUrl: string;

  @IsOptional()
  fileSize?: number;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Categorization
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  // Expiration
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  isExpired?: boolean;
}

export class SignDocumentDto {
  @IsString()
  signedBy: string;

  @IsString()
  signatureHash: string;
}

export class BulkDownloadDto {
  @ApiProperty({
    description: 'Document IDs to include in the ZIP archive',
    type: [String],
    example: ['550e8400-e29b-41d4-a716-446655440000'],
  })
  @IsArray()
  @IsString({ each: true })
  documentIds: string[];
}

export class FilterDocumentsDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isExpired?: boolean;

  @IsOptional()
  @IsString()
  documentType?: string;
}
