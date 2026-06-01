import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ChangeEmailDto } from './dto/email-change.dto';
import { randomBytes } from 'crypto';
import { parseDuration } from '../auth/security.utils';
import { EmailService } from '../email/email.service';
import { RateLimitService } from '../auth/rate-limit.service';

@Injectable()
export class EmailVerificationService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private rateLimitService: RateLimitService,
  ) {}

  private getExpirySeconds(): number {
    // Environment var like '24h' or seconds. Default 24h
    return parseDuration(process.env.EMAIL_VERIFICATION_EXPIRES_IN ?? '24h', 24 * 60 * 60);
  }

  async requestEmailChange(userId: string, data: ChangeEmailDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if new email is already in use
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.newEmail },
    });

    if (existingUser) {
      throw new BadRequestException('Email is already in use');
    }

    // Generate verification token
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.getExpirySeconds() * 1000);

    // Store pending email and token (invalidate previous)
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        pendingEmail: data.newEmail,
        emailVerificationToken: token,
        emailVerificationExpires: expiresAt,
      },
    });

    // Send verification email with token
    await this.emailService.sendEmail({
      to: data.newEmail,
      subject: 'Verify your email - PropChain',
      template: 'email-verification',
      context: { token },
      userId: userId,
      emailType: 'email_verification',
    }).catch((err) => {
      // Fail quietly but log
      console.error('Failed to queue verification email:', err?.message || err);
    });

    return {
      message: 'Verification email sent. Please check your new email to verify the change.',
      pendingEmail: data.newEmail,
    };
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.pendingEmail) {
      throw new BadRequestException('No pending email change to resend verification for');
    }

    // Rate limit resends per endpoint to prevent abuse
    const limit = await this.rateLimitService.checkEndpointRateLimit('POST /users/email/resend');
    if (limit.isExceeded) {
      throw new BadRequestException('Too many verification requests. Please try again later');
    }

    // Generate and store a new token, invalidating the old one
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.getExpirySeconds() * 1000);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerificationToken: token,
        emailVerificationExpires: expiresAt,
      },
    });

    // Send verification email
    await this.emailService.sendEmail({
      to: user.pendingEmail,
      subject: 'Verify your email - PropChain',
      template: 'email-verification',
      context: { token },
      userId: userId,
      emailType: 'email_verification',
    }).catch((err) => {
      console.error('Failed to queue verification email:', err?.message || err);
    });

    return { message: 'Verification email resent' };
  }

  async verifyEmailChange(userId: string, token: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.emailVerificationToken || !user.emailVerificationExpires) {
      throw new BadRequestException('No pending email change');
    }

    // Check if token is expired
    if (new Date() > user.emailVerificationExpires) {
      // Clear expired token
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          pendingEmail: null,
          emailVerificationToken: null,
          emailVerificationExpires: null,
        },
      });
      throw new BadRequestException('Verification token has expired');
    }

    // Verify token
    if (user.emailVerificationToken !== token) {
      throw new BadRequestException('Invalid verification token');
    }

    if (!user.pendingEmail) {
      throw new BadRequestException('No pending email to verify');
    }

    // Update email and clear verification fields
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: user.pendingEmail,
        pendingEmail: null,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        updatedAt: true,
      },
    });

    return {
      message: 'Email changed successfully',
      user: updatedUser,
    };
  }

  async cancelEmailChange(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.pendingEmail) {
      throw new BadRequestException('No pending email change');
    }

    // Clear pending email and token
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        pendingEmail: null,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });

    return { message: 'Email change cancelled successfully' };
  }
}
