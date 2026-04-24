import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { DocumentsService } from './documents.service';
import {
  CreateDocumentDto,
  UpdateDocumentDto,
  SignDocumentDto,
  BulkDownloadDto,
  FilterDocumentsDto,
} from './dto/document.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { UserRole } from '../types/prisma.types';

@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  // ── CRUD ─────────────────────────────────────────────────────────────────

  @Post()
  create(@Body() dto: CreateDocumentDto, @CurrentUser() user: AuthUserPayload) {
    return this.documentsService.create(dto, user.sub);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUserPayload, @Query() filter: FilterDocumentsDto) {
    return this.documentsService.findAll(user.sub, filter);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentsService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.documentsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.documentsService.remove(id);
  }

  // ── #402 Expiration ──────────────────────────────────────────────────────

  @Get('expiration/expiring')
  getExpiring(@Query('days') days?: string) {
    return this.documentsService.getExpiringDocuments(days ? +days : 7);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('expiration/mark-expired')
  markExpired() {
    return this.documentsService.markExpiredDocuments();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('expiration/delete-expired')
  deleteExpired() {
    return this.documentsService.deleteExpired();
  }

  @Put(':id/expiration/notified')
  flagNotified(@Param('id') id: string) {
    return this.documentsService.flagExpiryNotified(id);
  }

  // ── #403 eSignature ──────────────────────────────────────────────────────

  @Post(':id/sign')
  sign(@Param('id') id: string, @Body() dto: SignDocumentDto) {
    return this.documentsService.signDocument(id, dto);
  }

  @Get(':id/verify')
  verify(@Param('id') id: string) {
    return this.documentsService.verifySignature(id);
  }

  // ── #404 Bulk Download ───────────────────────────────────────────────────

  @Post('bulk-download')
  bulkDownload(@Body() dto: BulkDownloadDto, @Res() res: Response) {
    return this.documentsService.bulkDownload(dto, res);
  }
}
