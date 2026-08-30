

import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ContentService } from './content.service';
import {
  CreateBannerDto,
  CreateFaqDto,
  UpdateBannerDto,
  UpdateFaqDto,
  UpdateLegalDto,
  UpdatePageDto,
} from './dto';

@Controller('content')
export class ContentController {
  constructor(private readonly service: ContentService) {}

  @Post('pages/:slug')
  updatePage(
    @Param('slug') slug: string,
    @Body() body: UpdatePageDto,
  ) {
    return this.service.updatePage(slug, body);
  }

  @Get('pages/:slug')
  getPage(@Param('slug') slug: string) {
    return this.service.getPage(slug);
  }

  @Post('banners')
  createBanner(@Body() body: CreateBannerDto) {
    return this.service.createBanner(body);
  }

  @Get('banners')
  getBanners() {
    return this.service.getBanners();
  }

  @Patch('banners/:id')
  updateBanner(
    @Param('id') id: string,
    @Body() body: UpdateBannerDto,
  ) {
    return this.service.updateBanner(id, body);
  }

  @Post('faqs')
  createFAQ(@Body() body: CreateFaqDto) {
    return this.service.createFAQ(body);
  }

  @Get('faqs')
  getFAQs() {
    return this.service.getFAQs();
  }

  @Patch('faqs/:id')
  updateFAQ(
    @Param('id') id: string,
    @Body() body: UpdateFaqDto,
  ) {
    return this.service.updateFAQ(id, body);
  }

  @Post('legal/:type')
  updateLegal(
    @Param('type') type: string,
    @Body() body: UpdateLegalDto,
  ) {
    return this.service.updateLegal(type, body);
  }

  @Get('legal/:type')
  getLegal(@Param('type') type: string) {
    return this.service.getLegal(type);
  }
}