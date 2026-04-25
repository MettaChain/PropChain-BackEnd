import { canSendNotification } from "./notification-throttle.util";

async sendNotification(userId: string, type: string, payload: any) {
  const allowed = await canSendNotification(userId, type);
  if (!allowed) {
    // log throttling event
    logInfo("Notification throttled", { userId, type });
    return;
  }

  // proceed with sending
  await this.prisma.notification.create({
    data: { userId, type, payload },
  });
}
