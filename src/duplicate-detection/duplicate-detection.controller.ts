// @ts-nocheck

import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { CheckDuplicateDto, FlagForReviewDto, MergeDuplicateDto } from './dto/duplicate.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserPayload } from '../auth/types/auth-user.type';

@Controller('properties/duplicates')
export class DuplicateDetectionController {
  constructor(private readonly duplicateDetectionService: DuplicateDetectionService) {}

  @UseGuards(JwtAuthGuard)
  @Post('check')
  async checkDuplicates(
    @Body() checkDuplicateDto: CheckDuplicateDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.duplicateDetectionService.checkForDuplicates(checkDuplicateDto, user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('merge')
  async mergeProperties(
    @Body() mergeDuplicateDto: MergeDuplicateDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.duplicateDetectionService.mergeProperties(mergeDuplicateDto, user.sub, user.role);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':propertyId/flag')
  async flagForReview(@Param('propertyId') propertyId: string, @Body() dto: FlagForReviewDto) {
    return this.duplicateDetectionService.flagForReview(
      propertyId,
      dto.duplicateOfId,
      dto.reviewNotes,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('flags')
  async getFlags() {
    return this.duplicateDetectionService.getFlags();
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/resolve')
  async resolveFlag(@Param('id') flagId: string) {
    return this.duplicateDetectionService.resolveFlag(flagId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('batch')
  async detectBatchDuplicates(@Body() body: { propertyIds: string[] }) {
    return this.duplicateDetectionService.detectBatchDuplicates(body.propertyIds);
  }

  @UseGuards(JwtAuthGuard)
  @Get('stats')
  async getDuplicateStats() {
    return this.duplicateDetectionService.getDuplicateStats();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':propertyId/nearby')
  async findNearbyDuplicates(
    @Param('propertyId') propertyId: string,
    @Query('radius') radius?: string,
  ) {
    const radiusMeters = radius ? parseInt(radius, 10) : 500;
    return this.duplicateDetectionService.findNearbyDuplicates(propertyId, radiusMeters);
  }
}
