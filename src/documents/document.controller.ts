import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiHeader, ApiConsumes } from '@nestjs/swagger';
import {
  DocumentAccessContext,
  DocumentMetadataInput,
  DocumentSearchFilters,
} from './document.model';
import { DocumentService } from './document.service';
import {
  UploadDocumentDto,
  UpdateMetadataDto,
  DocumentQueryDto,
  DownloadQueryDto,
  DocumentResponseDto,
  DownloadUrlResponseDto,
} from './dto';

@ApiTags('documents')
@Controller('documents')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('upload')
  @UseInterceptors(FilesInterceptor('files'))
  @ApiOperation({ summary: 'Upload documents with metadata' })
  @ApiConsumes('multipart/form-data')
  @ApiHeader({ name: 'x-user-id', description: 'User ID', required: true })
  @ApiHeader({ name: 'x-user-roles', description: 'Comma-separated user roles', required: false })
  @ApiResponse({ status: 201, description: 'Documents uploaded successfully.', type: [DocumentResponseDto] })
  @ApiResponse({ status: 400, description: 'Invalid input data.' })
  async uploadDocuments(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: UploadDocumentDto,
    @Headers('x-user-id') userId: string,
    @Headers('x-user-roles') rolesHeader?: string,
  ) {
    const context = this.buildAccessContext(userId, rolesHeader);
    const metadata = this.parseMetadataInput(body);
    return this.documentService.uploadDocuments(files, metadata, context);
  }

  @Post(':id/version')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Add a new version to existing document' })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiHeader({ name: 'x-user-id', description: 'User ID', required: true })
  @ApiHeader({ name: 'x-user-roles', description: 'Comma-separated user roles', required: false })
  @ApiResponse({ status: 201, description: 'Version added successfully.', type: DocumentResponseDto })
  @ApiResponse({ status: 404, description: 'Document not found.' })
  async addVersion(
    @Param('id') documentId: string,
    @UploadedFile() file: Express.Multer.File,
    @Headers('x-user-id') userId: string,
    @Headers('x-user-roles') rolesHeader?: string,
  ) {
    const context = this.buildAccessContext(userId, rolesHeader);
    return this.documentService.addDocumentVersion(documentId, file, context);
  }

  @Patch(':id/metadata')
  @ApiOperation({ summary: 'Update document metadata' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiHeader({ name: 'x-user-id', description: 'User ID', required: true })
  @ApiHeader({ name: 'x-user-roles', description: 'Comma-separated user roles', required: false })
  @ApiResponse({ status: 200, description: 'Metadata updated successfully.', type: DocumentResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input data.' })
  @ApiResponse({ status: 404, description: 'Document not found.' })
  async updateMetadata(
    @Param('id') documentId: string,
    @Body() body: UpdateMetadataDto,
    @Headers('x-user-id') userId: string,
    @Headers('x-user-roles') rolesHeader?: string,
  ) {
    const context = this.buildAccessContext(userId, rolesHeader);
    const metadata = this.parseMetadataInput(body);
    return this.documentService.updateMetadata(documentId, metadata, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document details' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiHeader({ name: 'x-user-id', description: 'User ID', required: true })
  @ApiHeader({ name: 'x-user-roles', description: 'Comma-separated user roles', required: false })
  @ApiResponse({ status: 200, description: 'Document found.', type: DocumentResponseDto })
  @ApiResponse({ status: 404, description: 'Document not found.' })
  async getDocument(
    @Param('id') documentId: string,
    @Headers('x-user-id') userId: string,
    @Headers('x-user-roles') rolesHeader?: string,
  ) {
    const context = this.buildAccessContext(userId, rolesHeader);
    return this.documentService.getDocument(documentId, context);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Get download URL for document' })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiHeader({ name: 'x-user-id', description: 'User ID', required: true })
  @ApiHeader({ name: 'x-user-roles', description: 'Comma-separated user roles', required: false })
  @ApiResponse({ status: 200, description: 'Download URL generated.', type: DownloadUrlResponseDto })
  @ApiResponse({ status: 404, description: 'Document not found.' })
  async downloadDocument(
    @Param('id') documentId: string,
    @Query() query: DownloadQueryDto,
    @Headers('x-user-id') userId: string,
    @Headers('x-user-roles') rolesHeader?: string,
  ) {
    const context = this.buildAccessContext(userId, rolesHeader);
    return this.documentService.getDownloadUrl(documentId, query.version, context);
  }

  @Get()
  @ApiOperation({ summary: 'List documents with filters' })
  @ApiHeader({ name: 'x-user-id', description: 'User ID', required: true })
  @ApiHeader({ name: 'x-user-roles', description: 'Comma-separated user roles', required: false })
  @ApiResponse({ status: 200, description: 'List of documents.', type: [DocumentResponseDto] })
  async listDocuments(
    @Query() query: DocumentQueryDto,
    @Headers('x-user-id') userId: string,
    @Headers('x-user-roles') rolesHeader?: string,
  ) {
    const context = this.buildAccessContext(userId, rolesHeader);
    const filters: DocumentSearchFilters = {
      propertyId: query.propertyId,
      type: query.type,
      accessLevel: query.accessLevel,
      tag: query.tag,
      uploadedBy: query.uploadedBy,
      mimeType: query.mimeType,
      createdAfter: query.createdAfter ? new Date(query.createdAfter) : undefined,
      createdBefore: query.createdBefore ? new Date(query.createdBefore) : undefined,
      search: query.search,
    };
    return this.documentService.listDocuments(filters, context);
  }

  private buildAccessContext(userId: string, rolesHeader?: string): DocumentAccessContext {
    return {
      userId,
      roles: this.parseCsv(rolesHeader),
    };
  }

  private parseMetadataInput(input: UploadDocumentDto | UpdateMetadataDto): DocumentMetadataInput {
    return {
      propertyId: input.propertyId,
      type: input.type,
      title: input.title,
      description: input.description,
      tags: input.tags === undefined ? undefined : this.parseCsv(input.tags),
      accessLevel: input.accessLevel,
      allowedUserIds:
        input.allowedUserIds === undefined ? undefined : this.parseCsv(input.allowedUserIds),
      allowedRoles: input.allowedRoles === undefined ? undefined : this.parseCsv(input.allowedRoles),
      customFields: input.customFields === undefined ? undefined : this.parseCustomFields(input.customFields),
    };
  }

  private parseCsv(value?: string): string[] {
    if (!value) {
      return [];
    }
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  private parseCustomFields(value?: string): Record<string, string> {
    if (!value) {
      return {};
    }
    try {
      const parsed = JSON.parse(value) as Record<string, string>;
      return parsed || {};
    } catch {
      return {};
    }
  }
}
