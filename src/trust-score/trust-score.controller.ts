import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthenticatedRequest } from './types/authenticated-request.interface';
import { TrustScoreService } from './trust-score.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiKeyAuthGuard } from '../auth/guards/api-key-auth.guard';
import {
  TrustScoreDto,
  TrustScoreSummaryDto,
  TrustScoreBreakdownDto,
  BatchUpdateResponseDto,
} from './dto/trust-score.dto';

@Controller('trust-score')
@UseGuards(JwtAuthGuard, ApiKeyAuthGuard)
export class TrustScoreController {
  constructor(private readonly trustScoreService: TrustScoreService) {}

  @Get('me')
  async getMyTrustScore(@Request() req: AuthenticatedRequest): Promise<TrustScoreDto> {
    const userId = req.authUser.id;
    const forceRefresh = req.query.refresh === 'true';
    return this.trustScoreService.getTrustScore(userId, forceRefresh);
  }

  @Get('me/summary')
  async getMyTrustScoreSummary(
    @Request() req: AuthenticatedRequest,
  ): Promise<TrustScoreSummaryDto> {
    const userId = req.authUser.id;
    const forceRefresh = req.query.refresh === 'true';
    const result = await this.trustScoreService.getTrustScore(userId, forceRefresh);

    return {
      userId: result.userId,
      score: result.score,
      lastUpdated: result.lastUpdated,
      nextUpdateTime: result.nextUpdateTime,
    };
  }

  @Get('me/breakdown')
  async getMyTrustScoreBreakdown(
    @Request() req: AuthenticatedRequest,
  ): Promise<TrustScoreBreakdownDto> {
    const userId = req.authUser.id;
    return this.trustScoreService.getScoreBreakdown(userId);
  }

  @Get(':userId')
  async getUserTrustScore(
    @Param('userId') userId: string,
    @Query('refresh') refresh?: string,
  ): Promise<TrustScoreDto> {
    const forceRefresh = refresh === 'true';
    return this.trustScoreService.getTrustScore(userId, forceRefresh);
  }

  @Get(':userId/summary')
  async getUserTrustScoreSummary(
    @Param('userId') userId: string,
    @Query('refresh') refresh?: string,
  ): Promise<TrustScoreSummaryDto> {
    const forceRefresh = refresh === 'true';
    const result = await this.trustScoreService.getTrustScore(userId, forceRefresh);

    return {
      userId: result.userId,
      score: result.score,
      lastUpdated: result.lastUpdated,
      nextUpdateTime: result.nextUpdateTime,
    };
  }

  @Get(':userId/breakdown')
  async getUserTrustScoreBreakdown(
    @Param('userId') userId: string,
  ): Promise<TrustScoreBreakdownDto> {
    return this.trustScoreService.getScoreBreakdown(userId);
  }

  @Post('me/calculate')
  @HttpCode(HttpStatus.OK)
  async calculateMyTrustScore(@Request() req: AuthenticatedRequest): Promise<TrustScoreDto> {
    const userId = req.authUser.id;
    return this.trustScoreService.calculateTrustScore(userId);
  }

  @Post(':userId/calculate')
  @HttpCode(HttpStatus.OK)
  async calculateUserTrustScore(@Param('userId') userId: string): Promise<TrustScoreDto> {
    return this.trustScoreService.calculateTrustScore(userId);
  }

  @Post('batch-update')
  @HttpCode(HttpStatus.OK)
  async batchUpdateTrustScores(): Promise<BatchUpdateResponseDto> {
    return this.trustScoreService.batchUpdateTrustScores();
  }
}
