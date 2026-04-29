import { Body, Controller, Get, Param, Patch, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { EmailDigestService } from './email-digest.service';
import { UpdateDigestPreferenceDto } from './dto/update-digest-preference.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('email-digest')
export class EmailDigestController {
  constructor(private readonly emailDigestService: EmailDigestService) {}

  @UseGuards(JwtAuthGuard)
  @Get('preference')
  getPreference(@CurrentUser() user: { id: string }) {
    return this.emailDigestService.getOrCreatePreference(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('preference')
  updatePreference(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateDigestPreferenceDto,
  ) {
    return this.emailDigestService.updatePreference(user.id, dto);
  }

  @Get('unsubscribe')
  async unsubscribe(@Query('token') token: string, @Res() res: Response) {
    const success = await this.emailDigestService.unsubscribeByToken(token);
    const message = success
      ? 'You have been unsubscribed from PropChain email digests.'
      : 'Invalid or expired unsubscribe link.';
    return res.send(`<html><body style="font-family:Arial;text-align:center;padding:40px"><h2>${message}</h2></body></html>`);
  }
}
