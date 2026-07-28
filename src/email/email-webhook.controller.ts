// @ts-nocheck

import { Controller, Post, Body, Get, HttpCode, UseGuards } from '@nestjs/common';
import { EmailService } from './email.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { UserRole } from '../types/prisma.types';

@ApiTags('Email')
@Controller('email')
export class EmailWebhookController {
  constructor(private emailService: EmailService) {}

  @Post('webhook/bounce')
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle email bounce/complaint webhooks' })
  async handleBounce(@Body() payload: any) {
    const email = payload.email || payload.recipient;
    const type = payload.type || (payload.bounceType === 'Hard' ? 'HARD' : 'SOFT');
    const reason = payload.reason || payload.diagnosticCode;

    if (email) {
      await this.emailService.handleBounce(email, type as 'HARD' | 'SOFT', reason, payload);
    }

    return { received: true };
  }

  @Post('webhook/complaint')
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle spam complaint webhooks' })
  async handleComplaint(@Body() payload: any) {
    const email = payload.email || payload.recipient;

    if (email) {
      await this.emailService.handleComplaint(email, payload);
    }

    return { received: true };
  }

  @Get('reputation')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get sender reputation metrics' })
  async getReputation() {
    return this.emailService.getSenderReputation();
  }
}
