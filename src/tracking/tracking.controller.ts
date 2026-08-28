// @ts-nocheck

import { Controller, Get, Query, Res, Req, Param } from '@nestjs/common';
import { Response, Request } from 'express';
import { TrackingService } from './tracking.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('tracking')
@Controller('track')
export class TrackingController {
  constructor(private trackingService: TrackingService) {}

  /**
   * Validates a redirect target against an http(s) scheme check and an
   * allow-list of hostnames (TRACKING_ALLOWED_REDIRECT_HOSTS, comma-separated).
   * Fails closed: when no allow-list is configured, all external redirects are
   * rejected, preventing this public endpoint from being abused as an open
   * redirect / phishing vehicle.
   */
  private isSafeRedirect(target: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return false;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const allowed = (process.env.TRACKING_ALLOWED_REDIRECT_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    if (allowed.length === 0) {
      return false;
    }
    return allowed.includes(parsed.hostname.toLowerCase());
  }

  @Get('click')
  @ApiOperation({ summary: 'Track link click and redirect' })
  async trackClick(
    @Query('url') url: string,
    @Query('userId') userId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!url) {
      return res.status(400).send('URL is required');
    }

    if (!this.isSafeRedirect(url)) {
      return res.status(400).send('Invalid or disallowed redirect URL');
    }

    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    await this.trackingService.trackClick(url, userId, ipAddress, userAgent);

    return res.redirect(url);
  }

  @Get('open/:trackingId.png')
  @ApiOperation({ summary: 'Track email open via pixel' })
  async trackOpen(
    @Param('trackingId') trackingId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    await this.trackingService.trackEmailOpen(trackingId, ipAddress, userAgent);

    // 1x1 transparent PNG pixel
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64',
    );

    res.set({
      'Content-Type': 'image/png',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });

    return res.send(pixel);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get tracking statistics' })
  async getStats() {
    const clickStats = await this.trackingService.getClickStats();
    const emailStats = await this.trackingService.getEmailStats();

    return {
      clicks: clickStats,
      emails: emailStats,
    };
  }
}
