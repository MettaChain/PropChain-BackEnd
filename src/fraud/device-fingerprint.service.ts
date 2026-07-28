// @ts-nocheck

/**
 * DeviceFingerprintService (#961)
 *
 * Implements a stable device fingerprint derived from the combination of:
 *   - the `User-Agent` header
 *   - the `Accept-Language` header
 *   - the originating IP address (extracted via GeoLocationService)
 *
 * The fingerprint is intentionally not a hardware-specific hash (browser
 * canvas, WebGL, etc.) — those would require client-side libraries. What
 * we produce here is a deterministic SHA-256 of the high-entropy request
 * headers so we can detect *new* device/IP combinations quickly inside
 * the fraud evaluation pipeline.
 */

import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

export interface FingerprintInput {
  userAgent: string | null | undefined;
  acceptLanguage: string | null | undefined;
  ipAddress: string | null | undefined;
}

export interface FingerprintResult {
  fingerprint: string;
  derived: {
    browserFamily: string;
    osFamily: string;
    isMobile: boolean;
    isBot: boolean;
  };
}

@Injectable()
export class DeviceFingerprintService {
  private readonly logger = new Logger(DeviceFingerprintService.name);

  compute(input: FingerprintInput): FingerprintResult {
    const userAgent = input.userAgent ?? '';
    const acceptLanguage = input.acceptLanguage ?? '';
    const ipAddress = input.ipAddress ?? '';

    const fingerprint = createHash('sha256')
      .update(`${userAgent}\u0000${acceptLanguage}\u0000${ipAddress}`)
      .digest('hex');

    return {
      fingerprint,
      derived: this.parseUserAgent(userAgent),
    };
  }

  private parseUserAgent(userAgent: string) {
    const ua = userAgent.toLowerCase();
    const browserFamily = this.detectBrowser(ua);
    const osFamily = this.detectOs(ua);
    const isMobile = ua.includes('mobile') || ua.includes('iphone') || ua.includes('android');
    const isBot =
      ua.includes('bot') ||
      ua.includes('crawler') ||
      ua.includes('spider') ||
      ua.includes('curl') ||
      ua.includes('wget');

    return { browserFamily, osFamily, isMobile, isBot };
  }

  private detectBrowser(ua: string): string {
    if (ua.includes('edg/')) return 'Edge';
    if (ua.includes('chrome/') && !ua.includes('chromium')) return 'Chrome';
    if (ua.includes('firefox/')) return 'Firefox';
    if (ua.includes('safari/') && !ua.includes('chrome')) return 'Safari';
    if (ua.includes('opera') || ua.includes('opr/')) return 'Opera';
    if (ua.includes('curl')) return 'curl';
    return 'Unknown';
  }

  private detectOs(ua: string): string {
    if (ua.includes('windows nt')) return 'Windows';
    if (ua.includes('mac os x')) return 'macOS';
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) return 'iOS';
    if (ua.includes('android')) return 'Android';
    if (ua.includes('linux')) return 'Linux';
    return 'Unknown';
  }
}
