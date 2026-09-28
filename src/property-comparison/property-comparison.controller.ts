// @ts-nocheck

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PropertyComparisonService } from './property-comparison.service';
import { CompareBodyDto, CompareQueryDto } from './dto/comparison.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserPayload } from '../auth/types/auth-user.type';

@Controller('property-comparison')
export class PropertyComparisonController {
  constructor(private readonly comparisonService: PropertyComparisonService) {}

  @Get()
  compareGet(@Query() query: CompareQueryDto) {
    return this.comparisonService.compare(query.ids);
  }

  @Post()
  comparePost(@Body() body: CompareBodyDto) {
    return this.comparisonService.compare(body.ids);
  }

  @Post('score')
  calculateScore(@Body() body: { properties: any[] }) {
    return this.comparisonService.calculateScore(body.properties);
  }

  @Post('share')
  createShareableLink(@Body() body: { propertyIds: string[]; userId?: string }) {
    return this.comparisonService.createShareableLink(body.propertyIds, body.userId);
  }

  /**
   * Public share resolution endpoint (issue #1292). Returns the compared
   * properties without owner PII and enforces expiry/revocation.
   */
  @Get('shares/:token')
  getSharedComparison(@Param('token') token: string) {
    return this.comparisonService.getSharedComparison(token);
  }

  /**
   * Backwards-compatible alias for the original share route.
   */
  @Get('shared/:shareToken')
  getSharedComparisonLegacy(@Param('shareToken') shareToken: string) {
    return this.comparisonService.getSharedComparison(shareToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('shares/:token/revoke')
  revokeShare(@CurrentUser() user: AuthUserPayload, @Param('token') token: string) {
    return this.comparisonService.revokeShare(token, user.sub);
  }

  @Post('export')
  exportComparison(@Body() body: { propertyIds: string[] }) {
    return this.comparisonService.exportComparison(body.propertyIds);
  }
}
