import { Controller, Post, Body, Req } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Controller("notifications")
export class NotificationController {
  constructor(private readonly prisma: PrismaService) {}

  @Post("preferences")
  async updatePreferences(@Req() req, @Body() body) {
    return this.prisma.notificationPreferences.upsert({
      where: { userId: req.user.id },
      update: body,
      create: { userId: req.user.id, ...body },
    });
  }
}
