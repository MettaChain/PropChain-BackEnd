import { Request } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function canSendNotification(userId: string, type: string): Promise<boolean> {
  const prefs = await prisma.notificationPreferences.findUnique({ where: { userId } });
  const now = new Date();

  // Check cooldown
  const last = await prisma.notification.findFirst({
    where: { userId, type },
    orderBy: { createdAt: "desc" },
  });
  if (last && prefs && prefs.cooldownSecs) {
    const diff = (now.getTime() - last.createdAt.getTime()) / 1000;
    if (diff < prefs.cooldownSecs) return false;
  }

  // Check per-hour limit
  const count = await prisma.notification.count({
    where: {
      userId,
      createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) },
    },
  });
  if (prefs && count >= prefs.maxPerHour) return false;

  return true;
}
