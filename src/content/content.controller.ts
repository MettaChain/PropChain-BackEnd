import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ContentService } from './content.service';

@Controller('content')
export class ContentController {
  constructor(private service: ContentService) {}

  @Post('pages/:slug')
  updatePage(@Param('slug') slug: string, @Body() body: { title: string; content: string }) {
    return this.service.updatePage(slug, body);
  }

  @Get('pages/:slug')
  getPage(@Param('slug') slug: string) {
    return this.service.getPage(slug);
  }

  @Post('banners')
  createBanner(@Body() body: { imageUrl: string; link?: string }) {
    return this.service.createBanner(body);
  }

  @Get('banners')
  getBanners() {
    return this.service.getBanners();
  }

  @Post('faqs')
  createFAQ(@Body() body: { question: string; answer: string }) {
    return this.service.createFAQ(body);
  }

  @Get('faqs')
  getFAQs() {
    return this.service.getFAQs();
  }

  @Post('legal/:type')
  updateLegal(@Param('type') type: string, @Body() body: { content: string }) {
    return this.service.updateLegal(type, body.content);
  }

  @Get('legal/:type')
  getLegal(@Param('type') type: string) {
    return this.service.getLegal(type);
  }
}
