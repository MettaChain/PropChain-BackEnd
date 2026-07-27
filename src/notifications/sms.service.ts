// @ts-nocheck

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SmsProvider {
  send(to: string, message: string): Promise<SmsResult>;
}

// ---------------------------------------------------------------------------
// Twilio provider
// ---------------------------------------------------------------------------

@Injectable()
export class TwilioSmsProvider implements SmsProvider {
  private readonly logger = new Logger(TwilioSmsProvider.name);
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;

  constructor(private readonly configService: ConfigService) {
    this.accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID', '');
    this.authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN', '');
    this.fromNumber = this.configService.get<string>('TWILIO_FROM_NUMBER', '');
  }

  async send(to: string, message: string): Promise<SmsResult> {
    try {
      const credentials = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
      const params = new URLSearchParams();
      params.append('To', to);
      params.append('From', this.fromNumber);
      params.append('Body', message);

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`Twilio error: ${body}`);
        return { success: false, error: `Twilio API error: ${response.status}` };
      }

      const data = (await response.json()) as any;
      this.logger.log(`SMS sent via Twilio: ${data.sid}`);
      return { success: true, messageId: data.sid };
    } catch (err) {
      this.logger.error(`Twilio send failed: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  }
}

// ---------------------------------------------------------------------------
// AWS SNS provider
// ---------------------------------------------------------------------------

@Injectable()
export class AwsSnsSmsProvider implements SmsProvider {
  private readonly logger = new Logger(AwsSnsSmsProvider.name);
  private readonly region: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('AWS_REGION', 'us-east-1');
    this.accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID', '');
    this.secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY', '');
  }

  async send(to: string, message: string): Promise<SmsResult> {
    try {
      const timestamp = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
      const dateStamp = timestamp.slice(0, 8);
      const amzDate = timestamp.slice(0, 15) + 'Z';
      const service = 'sns';
      const region = this.region;
      const host = `sns.${region}.amazonaws.com`;

      const params: Record<string, string> = {
        Action: 'Publish',
        Message: message,
        PhoneNumber: to,
        Version: '2010-03-31',
      };

      const sortedParams = Object.keys(params)
        .sort()
        .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
        .join('&');

      const canonicalRequest = [
        'POST',
        '/',
        '',
        `host:${host}\n`,
        'host',
        await this.sha256(sortedParams),
      ].join('\n');

      const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
      const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        await this.sha256(canonicalRequest),
      ].join('\n');

      const kDate = await this.hmac(`AWS4${this.secretAccessKey}`, dateStamp);
      const kRegion = await this.hmac(kDate, region);
      const kService = await this.hmac(kRegion, service);
      const kSigning = await this.hmac(kService, 'aws4_request');
      const signature = await this.hmacHex(kSigning, stringToSign);

      const authorizationHeader = [
        `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}`,
        'SignedHeaders=host',
        `Signature=${signature}`,
      ].join(', ');

      const response = await fetch(`https://${host}/?${sortedParams}`, {
        method: 'POST',
        headers: {
          Authorization: authorizationHeader,
          'X-Amz-Date': amzDate,
          'Content-Type': 'application/x-www-form-urlencoded',
          Host: host,
        },
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`AWS SNS error: ${body}`);
        return { success: false, error: `AWS SNS API error: ${response.status}` };
      }

      const bodyText = await response.text();
      const messageIdMatch = bodyText.match(/<MessageId>(.+?)<\/MessageId>/);
      const messageId = messageIdMatch?.[1];
      this.logger.log(`SMS sent via AWS SNS: ${messageId}`);
      return { success: true, messageId };
    } catch (err) {
      this.logger.error(`AWS SNS send failed: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  }

  private async sha256(data: string): Promise<string> {
    const { createHash } = await import('crypto');
    return createHash('sha256').update(data).digest('hex');
  }

  private async hmac(key: string | Buffer, data: string): Promise<Buffer> {
    const { createHmac } = await import('crypto');
    return createHmac('sha256', key).update(data).digest();
  }

  private async hmacHex(key: Buffer, data: string): Promise<string> {
    const { createHmac } = await import('crypto');
    return createHmac('sha256', key).update(data).digest('hex');
  }
}

// ---------------------------------------------------------------------------
// Mock provider (for dev/testing)
// ---------------------------------------------------------------------------

@Injectable()
export class MockSmsProvider implements SmsProvider {
  private readonly logger = new Logger(MockSmsProvider.name);

  async send(to: string, message: string): Promise<SmsResult> {
    this.logger.log(`[MOCK SMS] To: ${to} | Message: ${message}`);
    return { success: true, messageId: `mock-${Date.now()}` };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

@Injectable()
export class SmsProviderFactory {
  private readonly provider: SmsProvider;

  constructor(
    private readonly configService: ConfigService,
    private readonly twilioProvider: TwilioSmsProvider,
    private readonly awsProvider: AwsSnsSmsProvider,
    private readonly mockProvider: MockSmsProvider,
  ) {
    const providerName = this.configService.get<string>('SMS_PROVIDER', 'mock').toLowerCase();
    switch (providerName) {
      case 'twilio':
        this.provider = twilioProvider;
        break;
      case 'aws':
        this.provider = awsProvider;
        break;
      default:
        this.provider = mockProvider;
        break;
    }
  }

  getProvider(): SmsProvider {
    return this.provider;
  }
}

// ---------------------------------------------------------------------------
// Rate limiter helper
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  timestamps: number[];
}

// ---------------------------------------------------------------------------
// SMS Service (enhanced)
// ---------------------------------------------------------------------------

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  private readonly optedOutPhones = new Set<string>();
  private readonly rateLimitMap = new Map<string, RateLimitEntry>();
  private readonly maxPerMinute = 10;
  private readonly optOutStoragePath: string;

  constructor(
    private readonly smsProviderFactory: SmsProviderFactory,
    private readonly configService: ConfigService,
  ) {
    this.optOutStoragePath = this.configService.get<string>(
      'SMS_OPTOUT_STORAGE',
      './data/sms-optout.json',
    );
    this.loadOptOutList();
  }

  async sendSms(to: string, message: string): Promise<SmsResult> {
    const normalized = this.normalizePhone(to);
    if (!this.validatePhoneNumber(normalized)) {
      throw new BadRequestException(`Invalid phone number: ${to}`);
    }
    if (this.isOptedOut(normalized)) {
      this.logger.warn(`SMS skipped: ${normalized} has opted out`);
      return { success: false, error: 'Phone number has opted out of SMS' };
    }
    if (!this.checkRateLimit(normalized)) {
      this.logger.warn(`SMS rate limited for ${normalized}`);
      return { success: false, error: 'Rate limit exceeded (max 10 SMS per minute)' };
    }

    const result = await this.smsProviderFactory.getProvider().send(normalized, message);
    if (result.success) {
      this.recordSend(normalized);
    }
    return result;
  }

  /**
   * Validate phone number format (E.164 or basic digits).
   */
  validatePhoneNumber(phone: string): boolean {
    if (!phone || phone.length < 7 || phone.length > 15) {
      return false;
    }
    const cleaned = phone.replace(/[\s\-().]/g, '');
    return /^\+?\d{7,15}$/.test(cleaned);
  }

  /**
   * Handle opt-out request from a phone number.
   */
  async handleOptOut(phone: string): Promise<void> {
    const normalized = this.normalizePhone(phone);
    this.optedOutPhones.add(normalized);
    await this.persistOptOutList();
    this.logger.log(`Phone ${normalized} opted out of SMS`);
  }

  /**
   * Check if a phone number has opted out.
   */
  isOptedOut(phone: string): boolean {
    return this.optedOutPhones.has(this.normalizePhone(phone));
  }

  // ---------------------------------------------------------------------------
  // Rate limiting
  // ---------------------------------------------------------------------------

  private checkRateLimit(phone: string): boolean {
    const now = Date.now();
    const windowMs = 60 * 1000;
    let entry = this.rateLimitMap.get(phone);
    if (!entry) {
      entry = { timestamps: [] };
      this.rateLimitMap.set(phone, entry);
    }
    entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);
    return entry.timestamps.length < this.maxPerMinute;
  }

  private recordSend(phone: string): void {
    let entry = this.rateLimitMap.get(phone);
    if (!entry) {
      entry = { timestamps: [] };
      this.rateLimitMap.set(phone, entry);
    }
    entry.timestamps.push(Date.now());
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private normalizePhone(phone: string): string {
    return phone.replace(/[\s\-()]/g, '');
  }

  private async loadOptOutList(): Promise<void> {
    try {
      const data = await fs.readFile(this.optOutStoragePath, 'utf-8');
      const phones = JSON.parse(data) as string[];
      phones.forEach((p) => this.optedOutPhones.add(p));
      this.logger.log(`Loaded ${phones.length} opted-out phone numbers`);
    } catch {
      // File may not exist yet; that's fine.
    }
  }

  private async persistOptOutList(): Promise<void> {
    try {
      const dir = this.optOutStoragePath.split('/').slice(0, -1).join('/');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.optOutStoragePath, JSON.stringify([...this.optedOutPhones], null, 2));
    } catch (err) {
      this.logger.error(`Failed to persist opt-out list: ${(err as Error).message}`);
    }
  }
}
