// @ts-nocheck

import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { EmailService } from './email.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('webhooks')
interface EmailBouncePayload {
  email?: string;
  recipient?: string;
  type?: string;
  bounceType?: string;
  reason?: string;
  diagnosticCode?: string;
}

@Controller('webhooks/email')
export class EmailWebhookController {
  constructor(private emailService: EmailService) {}

  @Post('bounce')
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle email bounce webhooks' })
  async handleBounce(@Body() payload: EmailBouncePayload) {
    // Basic extraction logic - in a real app, this would be provider-specific
    const email = payload.email || payload.recipient;
    const type = payload.type || (payload.bounceType === 'Hard' ? 'HARD' : 'SOFT');
    const reason = payload.reason || payload.diagnosticCode;

    if (email) {
      await this.emailService.handleBounce(email, type as 'HARD' | 'SOFT', reason, payload);
    }

    return { received: true };
  }
}
