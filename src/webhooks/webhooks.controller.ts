import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto, UpdateWebhookDto } from './webhook.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateWebhookDto) {
    return this.webhooksService.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.webhooksService.findAll(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.webhooksService.findOne(id, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateWebhookDto,
  ) {
    return this.webhooksService.update(id, user.id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.webhooksService.remove(id, user.id);
  }

  @Get(':id/deliveries')
  getDeliveries(@Param('id') id: string, @CurrentUser() user: any) {
    return this.webhooksService.getDeliveries(id, user.id);
  }
}