import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { TrackingService } from '../tracking/tracking.service';
import { v4 as uuidv4 } from 'uuid';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  userId?: string;
  emailType?: string;
  template?: string;
  context?: any;
}

export interface FraudAlertEmailPayload {
  alertId: string;
  pattern: string;
  severity: string;
  title: string;
  description: string;
  userEmail?: string | null;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly trackingService: TrackingService,
    @InjectQueue('mail') private readonly mailQueue: Queue,
  ) {}

  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    const resetUrl = `${this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000')}/reset-password?token=${resetToken}`;

    await this.sendEmail({
      to: email,
      subject: 'Password Reset - PropChain',
      template: 'password-reset',
      context: { resetUrl },
      text: `Password Reset Request. Please use this link: ${resetUrl}`,
    });
  }

  async sendAccountLockedEmail(email: string, lockoutDuration: number): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: 'Account Locked - PropChain',
      template: 'account-locked',
      context: { lockoutDuration },
      text: `Your account has been locked for ${lockoutDuration} minutes.`,
    });
  }

  async sendFraudAlertEmail(recipients: string[], payload: FraudAlertEmailPayload): Promise<void> {
    await Promise.all(
      recipients.map((recipient) =>
        this.sendEmail({
          to: recipient,
          subject: `[Fraud Alert][${payload.severity}] ${payload.title}`,
          template: 'fraud-alert',
          context: {
            alertId: payload.alertId,
            pattern: payload.pattern,
            severity: payload.severity,
            userEmail: payload.userEmail ?? 'Unknown',
            description: payload.description,
          },
          text: `Fraud Alert: ${payload.title}. Pattern: ${payload.pattern}. Severity: ${payload.severity}.`,
        }),
      ),
    );
  }

  async handleBounce(
    email: string,
    type: 'HARD' | 'SOFT',
    reason?: string,
    rawEvent?: any,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;

    await this.prisma.emailBounce.create({
      data: {
        userId: user.id,
        email,
        bounceType: type,
        reason,
        rawEvent,
      },
    });

    if (type === 'HARD') {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailStatus: 'INVALID' },
      });
    } else {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailStatus: 'BOUNCED' },
      });
    }
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    const baseUrl = this.configService.get<string>('API_URL', 'http://localhost:3000/api');
    let html = options.html;

    // 1. Check if user is blocked or has invalid email
    if (options.userId) {
      const user = await this.prisma.user.findUnique({ where: { id: options.userId } });
      if (user && (user.isBlocked || user.emailStatus === 'INVALID')) {
        this.logger.warn(`🚫 Skipping email to ${options.to} (User blocked or email invalid)`);
        return;
      }
    }

    // 2. Open Tracking: Inject pixel (only if we have a userId and emailType)
    // Note: If using templates, tracking usually needs to be handled in the template or post-render.
    // For simplicity in this implementation, we'll pass the tracking info to the context.
    if (options.userId && options.emailType) {
      const trackingId = uuidv4();
      await this.trackingService.createEmailEngagement(
        options.userId,
        options.emailType,
        trackingId,
      );
      
      const baseUrl = this.configService.get<string>('API_URL', 'http://localhost:3000/api');
      const pixelUrl = `${baseUrl}/track/open/${trackingId}.png`;
      
      options.context = {
        ...options.context,
        trackingPixel: pixelUrl,
        userId: options.userId,
      };
    }

    // 3. Add to Queue
    try {
      await this.mailQueue.add('sendEmail', {
        to: options.to,
        subject: options.subject,
        template: options.template,
        context: options.context,
        html: options.html,
        text: options.text,
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      });
      
      this.logger.log(`📧 Email to ${options.to} queued for subject: ${options.subject}`);
    } catch (error) {
      this.logger.error(`❌ Failed to queue email to ${options.to}: ${error.message}`);
      throw error;
    }
  }
}
