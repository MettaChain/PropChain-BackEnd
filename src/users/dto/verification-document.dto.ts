import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { VerificationStatus } from '@prisma/client';

export class CreateVerificationDocumentDto {
  @IsString()
  documentType: string;

  @IsString()
  fileName: string;

  @IsString()
  fileUrl: string;

  @IsString()
  fileSize: string;

  @IsString()
  mimeType: string;
}

export class ReviewVerificationDocumentDto {
  @IsEnum(VerificationStatus)
  status: VerificationStatus;

  @IsOptional()
  @IsString()
  adminNotes?: string;
}

export class UpdateVerificationDocumentDto {
  @IsOptional()
  @IsString()
  documentType?: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;
}
