import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('integrations')
@UseGuards(JwtAuthGuard)
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get('mls/listings')
  searchMls(
    @Query('location') location?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
  ) {
    return this.integrations.searchMlsListings({
      location,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
    });
  }

  @Get('mls/listings/:mlsId')
  getMlsListing(@Param('mlsId') mlsId: string) {
    return this.integrations.getMlsListing(mlsId);
  }

  @Post('payments/process')
  processPayment(@Body() body: { amount: number; currency: string; token: string }) {
    return this.integrations.processPayment(body.amount, body.currency, body.token);
  }

  @Post('payments/:transactionId/refund')
  refundPayment(@Param('transactionId') transactionId: string) {
    return this.integrations.refundPayment(transactionId);
  }

  @Post('crm/contacts')
  createContact(
    @Body() body: { name: string; email: string; phone?: string; type: 'lead' | 'client' },
  ) {
    return this.integrations.createCrmContact(body);
  }

  @Get('crm/contacts/:id')
  getContact(@Param('id') id: string) {
    return this.integrations.getCrmContact(id);
  }
}
