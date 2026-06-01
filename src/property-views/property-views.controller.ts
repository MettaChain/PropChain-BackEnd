import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { PropertyViewsService } from './property-views.service';
import {
  PopularPropertiesQueryDto,
  RecordViewDto,
  ViewHistoryQueryDto,
} from './dto/property-view.dto';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserPayload } from '../auth/types/auth-user.type';

interface RequestWithAuth extends Request {
  authUser?: AuthUserPayload;
}

@Controller('property-views')
export class PropertyViewsController {
  constructor(private readonly propertyViewsService: PropertyViewsService) {}

  /**
   * Record a property view. Auth is optional — authenticated users are tracked
   * by userId, anonymous viewers by IP address.
   */
  @UseGuards(OptionalJwtAuthGuard)
  @Post(':propertyId')
  record(
    @Param('propertyId', new ParseUUIDPipe()) propertyId: string,
    @Body() body: RecordViewDto,
    @Req() request: RequestWithAuth,
  ) {
    const ipAddress = this.getClientIp(request);
    const userAgent = request.headers['user-agent'] ?? null;
    const userId = request.authUser?.sub ?? null;

    return this.propertyViewsService.recordView(propertyId, {
      userId,
      ipAddress,
      userAgent,
      referrer: body.referrer ?? null,
      sessionId: body.sessionId ?? null,
    });
  }

  /**
   * Total lifetime view count for a property.
   */
  @Get(':propertyId/count')
  async count(@Param('propertyId', new ParseUUIDPipe()) propertyId: string) {
    const count = await this.propertyViewsService.getViewCount(propertyId);
    return { propertyId, count };
  }

  /**
   * Unique visitors (distinct authenticated users + distinct anonymous IPs).
   */
  @Get(':propertyId/unique')
  async unique(
    @Param('propertyId', new ParseUUIDPipe()) propertyId: string,
    @Query('since') since?: string,
  ) {
    const sinceDate = this.parseSince(since);
    const result = await this.propertyViewsService.getUniqueVisitorCount(propertyId, sinceDate);
    return { propertyId, ...result };
  }

  /**
   * Paginated view history for a property. Requires auth.
   */
  @UseGuards(JwtAuthGuard)
  @Get(':propertyId/history')
  history(
    @Param('propertyId', new ParseUUIDPipe()) propertyId: string,
    @Query() query: ViewHistoryQueryDto,
    @CurrentUser() _user: AuthUserPayload,
  ) {
    return this.propertyViewsService.getViewHistory(propertyId, {
      skip: query.skip,
      take: query.take,
      since: this.parseSince(query.since),
    });
  }

  /**
   * Most-viewed properties (popular query).
   */
  @Get('popular')
  popular(@Query() query: PopularPropertiesQueryDto) {
    return this.propertyViewsService.getPopularProperties({
      take: query.take,
      since: this.parseSince(query.since),
    });
  }

  @Get('leaderboard')
  leaderboard(@Query() query: PopularPropertiesQueryDto) {
    return this.propertyViewsService.getPopularProperties({
      take: query.take,
      since: this.parseSince(query.since),
    });
  }

  private parseSince(since?: string): Date | undefined {
    if (!since) return undefined;
    const date = new Date(since);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid `since` timestamp');
    }
    return date;
  }

  private getClientIp(request: Request): string | null {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim();
    }
    return request.ip ?? request.socket?.remoteAddress ?? null;
  }
}
