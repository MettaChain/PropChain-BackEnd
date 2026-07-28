import { DeviceFingerprintService } from './device-fingerprint.service';
import { createHash } from 'crypto';

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

describe('DeviceFingerprintService', () => {
  let service: DeviceFingerprintService;

  beforeEach(() => {
    service = new DeviceFingerprintService();
  });

  it('produces a SHA-256 of the \u0000-joined inputs', () => {
    const fingerprint = service.compute({
      userAgent: 'Mozilla/5.0',
      acceptLanguage: 'en-US',
      ipAddress: '8.8.8.8',
    });
    const expected = sha256('Mozilla/5.0\u0000en-US\u00008.8.8.8');
    expect(fingerprint.fingerprint).toBe(expected);
  });

  it('changes when the IP changes', () => {
    const a = service.compute({
      userAgent: 'Mozilla/5.0',
      acceptLanguage: 'en-US',
      ipAddress: '8.8.8.8',
    });
    const b = service.compute({
      userAgent: 'Mozilla/5.0',
      acceptLanguage: 'en-US',
      ipAddress: '1.1.1.1',
    });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it('parses common browser families', () => {
    const cases: Array<[string, string]> = [
      [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0',
        'Chrome',
      ],
      ['Mozilla/5.0 (X11; Linux x86_64; rv:90.0) Gecko/20100101 Firefox/90.0', 'Firefox'],
      [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_5_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15',
        'Safari',
      ],
      [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0 Edg/91.0',
        'Edge',
      ],
      ['curl/7.81.0', 'curl'],
    ];
    for (const [ua, family] of cases) {
      const result = service.compute({ userAgent: ua, acceptLanguage: null, ipAddress: null });
      expect(result.derived.browserFamily).toBe(family);
    }
  });

  it('detects mobile and bot user-agents', () => {
    const mobile = service.compute({
      userAgent:
        'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome/91.0 Mobile Safari/537.36',
      acceptLanguage: null,
      ipAddress: null,
    });
    expect(mobile.derived.isMobile).toBe(true);

    const bot = service.compute({
      userAgent: 'Googlebot/2.1 (+http://www.google.com/bot.html)',
      acceptLanguage: null,
      ipAddress: null,
    });
    expect(bot.derived.isBot).toBe(true);
  });

  it('handles empty inputs gracefully', () => {
    const result = service.compute({ userAgent: null, acceptLanguage: null, ipAddress: null });
    expect(result.fingerprint).toBe(sha256('\u0000\u0000'));
    expect(result.derived.browserFamily).toBe('Unknown');
    expect(result.derived.osFamily).toBe('Unknown');
  });
});
