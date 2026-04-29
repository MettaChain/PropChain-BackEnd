import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../email/email.service';
import { v4 as uuidv4 } from 'uuid';
import { DigestFrequency } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailDigestService {
  private readonly logger = new Logger(EmailDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async getOrCreatePreference(userId: string) {
    return this.prisma.digestPreference.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        frequency: DigestFrequency.DAILY,
        enabled: true,
        unsubscribeToken: uuidv4(),
      },
    });
  }

  async updatePreference(
    userId: string,
    data: { frequency?: DigestFrequency; enabled?: boolean },
  ) {
    return this.prisma.digestPreference.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        frequency: data.frequency ?? DigestFrequency.DAILY,
        enabled: data.enabled ?? true,
        unsubscribeToken: uuidv4(),
      },
    });
  }

  async unsubscribeByToken(token: string): Promise<boolean> {
    const pref = await this.prisma.digestPreference.findUnique({
      where: { unsubscribeToken: token },
    });
    if (!pref) return false;

    await this.prisma.digestPreference.update({
      where: { unsubscribeToken: token },
      data: { enabled: false },
    });
    return true;
  }

  async sendDigestsForFrequency(frequency: DigestFrequency): Promise<void> {
    const prefs = await this.prisma.digestPreference.findMany({
      where: { frequency, enabled: true },
      include: { user: { select: { id: true, email: true, firstName: true, emailStatus: true } } },
    });

    const since = this.getSinceDate(frequency);

    for (const pref of prefs) {
      if (pref.user.emailStatus === 'INVALID') continue;

      try {
        await this.sendDigestForUser(pref.user, since, pref.unsubscribeToken);
        await this.prisma.digestPreference.update({
          where: { id: pref.id },
          data: { lastSentAt: new Date() },
        });
      } catch (err) {
        this.logger.error(`Failed to send digest to ${pref.user.email}: ${err.message}`);
      }
    }
  }

  private async sendDigestForUser(
    user: { id: string; email: string; firstName: string },
    since: Date,
    unsubscribeToken: string,
  ): Promise<void> {
    const notifications = await this.prisma.notification.findMany({
      where: { userId: user.id, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    if (notifications.length === 0) return;

    const apiUrl = this.configService.get<string>('API_URL', 'http://localhost:3000/api');
    const unsubscribeUrl = `${apiUrl}/email-digest/unsubscribe?token=${unsubscribeToken}`;

    const html = this.buildDigestHtml(user.firstName, notifications, unsubscribeUrl);

    await this.emailService['sendEmail']({
      to: user.email,
      subject: `Your PropChain Digest – ${notifications.length} update${notifications.length > 1 ? 's' : ''}`,
      html,
      userId: user.id,
      emailType: 'digest',
    });
  }

  private buildDigestHtml(
    firstName: string,
    notifications: Array<{ title: string; message: string; type: string; createdAt: Date }>,
    unsubscribeUrl: string,
  ): string {
    const rows = notifications
      .map(
        (n) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #eee;">
            <strong style="color:#333;">${n.title}</strong>
            <span style="display:inline-block;margin-left:8px;padding:2px 8px;background:#f0f4ff;color:#4a6cf7;border-radius:12px;font-size:12px;">${n.type}</span>
            <p style="margin:4px 0 0;color:#666;font-size:14px;">${n.message}</p>
            <small style="color:#999;">${new Date(n.createdAt).toLocaleString()}</small>
          </td>
        </tr>`,
      )
      .join('');

    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">
        <div style="background:#4a6cf7;padding:24px;border-radius:8px 8px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:22px;">PropChain Digest</h1>
        </div>
        <div style="padding:24px;background:#fff;border:1px solid #eee;border-top:none;">
          <p>Hi ${firstName},</p>
          <p>Here's a summary of your recent notifications:</p>
          <table style="width:100%;border-collapse:collapse;">${rows}</table>
        </div>
        <div style="padding:16px;background:#f9f9f9;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px;text-align:center;">
          <small style="color:#999;">
            You're receiving this because you subscribed to PropChain digests.
            <a href="${unsubscribeUrl}" style="color:#4a6cf7;">Unsubscribe</a>
          </small>
        </div>
      </div>`;
  }

  private getSinceDate(frequency: DigestFrequency): Date {
    const now = new Date();
    if (frequency === DigestFrequency.WEEKLY) {
      now.setDate(now.getDate() - 7);
    } else {
      now.setDate(now.getDate() - 1);
    }
    return now;
  }
}
