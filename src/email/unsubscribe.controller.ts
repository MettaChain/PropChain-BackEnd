import { Controller, Get, Query } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Controller("unsubscribe")
export class UnsubscribeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async unsubscribe(@Query("userId") userId: string) {
    await this.prisma.emailPreferences.update({
      where: { userId },
      data: { subscribed: false },
    });
    return { message: "You have been unsubscribed successfully." };
  }
}
