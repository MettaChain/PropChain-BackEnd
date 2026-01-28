import { IsOptional, IsString, IsEnum, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType, DocumentAccessLevel } from '../document.model';

export class UpdateMetadataDto {
  @ApiPropertyOptional({
    description: 'Associated property ID',
    example: 'prop_abc123',
  })
  @IsOptional()
  @IsString({ message: 'Property ID must be a string' })
  propertyId?: string;

  @ApiPropertyOptional({
    description: 'Document type',
    enum: DocumentType,
    example: DocumentType.DEED,
  })
  @IsOptional()
  @IsEnum(DocumentType, { message: 'Invalid document type. Must be one of: DEED, INSPECTION_REPORT, PHOTO, OTHER' })
  type?: DocumentType;

  @ApiPropertyOptional({
    description: 'Document title',
    example: 'Property Deed 2024',
    maxLength: 200,
  })
  @IsOptional()
  @IsString({ message: 'Title must be a string' })
  @MaxLength(200, { message: 'Title must not exceed 200 characters' })
  title?: string;

  @ApiPropertyOptional({
    description: 'Document description',
    example: 'Official property deed document',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(1000, { message: 'Description must not exceed 1000 characters' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated tags',
    example: 'legal,deed,2024',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'Tags must be a string' })
  @MaxLength(500, { message: 'Tags must not exceed 500 characters' })
  tags?: string;

  @ApiPropertyOptional({
    description: 'Access level for the document',
    enum: DocumentAccessLevel,
  })
  @IsOptional()
  @IsEnum(DocumentAccessLevel, { message: 'Invalid access level. Must be one of: PRIVATE, RESTRICTED, PUBLIC' })
  accessLevel?: DocumentAccessLevel;

  @ApiPropertyOptional({
    description: 'Comma-separated user IDs allowed to access',
    example: 'user1,user2,user3',
  })
  @IsOptional()
  @IsString({ message: 'Allowed user IDs must be a string' })
  allowedUserIds?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated roles allowed to access',
    example: 'ADMIN,AGENT',
  })
  @IsOptional()
  @IsString({ message: 'Allowed roles must be a string' })
  allowedRoles?: string;

  @ApiPropertyOptional({
    description: 'Custom fields as JSON string',
    example: '{"category":"legal","priority":"high"}',
  })
  @IsOptional()
  @IsString({ message: 'Custom fields must be a JSON string' })
  customFields?: string;
}
