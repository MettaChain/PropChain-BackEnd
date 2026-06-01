import { IsOptional, IsString, IsUUID } from 'class-validator';

export class DownloadDocumentDto {
  @IsOptional()
  @IsUUID()
  versionId?: string;
}

export class RequestSignedUploadDto {
  @IsUUID()
  propertyId?: string;

  @IsUUID()
  // transactionId can be null depending on document context; optional in controller
  transactionId?: string;

  @IsString()
  fileName: string;

  @IsString()
  mimeType: string;

  fileSizeBytes: number;

  @IsOptional()
  @IsUUID()
  documentId?: string; // if updating an existing doc

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  // optional dispute binding
  disputeId?: string;
}
