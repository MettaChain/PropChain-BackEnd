import { IsString, IsIn, IsOptional, IsNumber, Min } from 'class-validator';

export const DOCUMENT_TYPE_ENUM = [
  'TITLE_DEED',
  'INSPECTION_REPORT',
  'APPRAISAL',
  'CONTRACT',
  'DISCLOSURE',
  'PHOTO',
  'FLOOR_PLAN',
] as const;

export class AttachDocumentDto {
  @IsIn(DOCUMENT_TYPE_ENUM)
  documentType: (typeof DOCUMENT_TYPE_ENUM)[number];

  @IsString()
  fileName: string;

  @IsString()
  fileUrl: string;

  @IsNumber()
  @Min(0)
  fileSize: number;

  @IsString()
  mimeType: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  stage?: string;

  @IsOptional()
  @IsString()
  changeNote?: string;
}

export class AddVersionDto {
  @IsString()
  fileUrl: string;

  @IsString()
  fileName: string;

  @IsNumber()
  @Min(0)
  fileSize: number;

  @IsOptional()
  @IsString()
  changeNote?: string;
}
