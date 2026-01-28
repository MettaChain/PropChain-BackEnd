import { IsOptional, IsString, IsEnum, IsISO8601 } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IntersectionType } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto';
import { DocumentType, DocumentAccessLevel } from '../document.model';

export class DocumentFilterDto {
  @ApiPropertyOptional({
    description: 'Filter by property ID',
    example: 'prop_abc123',
  })
  @IsOptional()
  @IsString({ message: 'Property ID must be a string' })
  propertyId?: string;

  @ApiPropertyOptional({
    description: 'Filter by document type',
    enum: DocumentType,
  })
  @IsOptional()
  @IsEnum(DocumentType, { message: 'Invalid document type' })
  type?: DocumentType;

  @ApiPropertyOptional({
    description: 'Filter by access level',
    enum: DocumentAccessLevel,
  })
  @IsOptional()
  @IsEnum(DocumentAccessLevel, { message: 'Invalid access level' })
  accessLevel?: DocumentAccessLevel;

  @ApiPropertyOptional({
    description: 'Filter by tag',
    example: 'legal',
  })
  @IsOptional()
  @IsString({ message: 'Tag must be a string' })
  tag?: string;

  @ApiPropertyOptional({
    description: 'Filter by uploader user ID',
    example: 'user_abc123',
  })
  @IsOptional()
  @IsString({ message: 'Uploaded by must be a string' })
  uploadedBy?: string;

  @ApiPropertyOptional({
    description: 'Filter by MIME type',
    example: 'application/pdf',
  })
  @IsOptional()
  @IsString({ message: 'MIME type must be a string' })
  mimeType?: string;

  @ApiPropertyOptional({
    description: 'Filter documents created after this date (ISO 8601)',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'createdAfter must be a valid ISO 8601 date' })
  createdAfter?: string;

  @ApiPropertyOptional({
    description: 'Filter documents created before this date (ISO 8601)',
    example: '2024-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'createdBefore must be a valid ISO 8601 date' })
  createdBefore?: string;

  @ApiPropertyOptional({
    description: 'Search in title and description',
    example: 'deed',
  })
  @IsOptional()
  @IsString({ message: 'Search must be a string' })
  search?: string;
}

export class DocumentQueryDto extends IntersectionType(
  DocumentFilterDto,
  PaginationDto,
) {}
