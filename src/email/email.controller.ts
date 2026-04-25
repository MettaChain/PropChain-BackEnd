import { EmailReportService } from './email-report.service';
import { Controller, Post, Body, Req, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";


@Controller('emails')
export class EmailController {
  constructor(private readonly reportService: EmailReportService) {}

  @Get('reports')
  async getReports() {
    return this.reportService.getMetrics();
  }
}


@Controller("emails/preferences")
export class EmailPreferencesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async updatePreferences(@Req() req, @Body() body) {
    return this.prisma.emailPreferences.upsert({
      where: { userId: req.user.id },
      update: body,
      create: { userId: req.user.id, ...body },
    });
  }
}
