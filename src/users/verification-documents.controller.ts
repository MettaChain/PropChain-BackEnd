import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards, Query } from '@nestjs/common';
import { VerificationDocumentsService } from './verification-documents.service';
import {
  CreateVerificationDocumentDto,
  ReviewVerificationDocumentDto,
  UpdateVerificationDocumentDto,
} from './dto/verification-document.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('users/verification-documents')
export class VerificationDocumentsController {
  constructor(private readonly verificationService: VerificationDocumentsService) {}

  @Post()
  createDocument(@CurrentUser() user: any, @Body() createDto: CreateVerificationDocumentDto) {
    return this.verificationService.create(user.id, createDto);
  }

  @Get()
  getAllDocuments(@CurrentUser() user: any) {
    return this.verificationService.findAllByUserId(user.id);
  }

  @Get(':id')
  getDocument(@CurrentUser() user: any, @Param('id') id: string) {
    return this.verificationService.findOne(id, user.id);
  }

  @Put(':id')
  updateDocument(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateVerificationDocumentDto,
  ) {
    return this.verificationService.update(id, user.id, updateDto);
  }

  @Delete(':id')
  removeDocument(@CurrentUser() user: any, @Param('id') id: string) {
    return this.verificationService.remove(id, user.id);
  }
}

// Admin controller for reviewing verification documents
@UseGuards(JwtAuthGuard)
@Controller('admin/verification-documents')
export class AdminVerificationDocumentsController {
  constructor(private readonly verificationService: VerificationDocumentsService) {}

  @Get()
  getAllDocumentsForAdmin(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.verificationService.findAllForAdmin(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      status,
    );
  }

  @Get(':id')
  getDocumentForAdmin(@Param('id') id: string) {
    return this.verificationService.findOne(id, '');
  }

  @Put(':id/review')
  reviewDocument(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() reviewDto: ReviewVerificationDocumentDto,
  ) {
    return this.verificationService.review(id, user.id, reviewDto);
  }
}
