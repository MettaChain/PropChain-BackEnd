import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ChangeEmailDto } from './dto/email-change.dto';
import { randomBytes } from 'crypto';

@Injectable()
export class EmailVerificationService {
  constructor(private prisma: PrismaService) {}

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
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Token expires in 24 hours

    // Store pending email and token
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        pendingEmail: data.newEmail,
        emailVerificationToken: token,
        emailVerificationExpires: expiresAt,
      },
    });

    // TODO: Send verification email with token
    // In production, integrate with email service (SendGrid, AWS SES, etc.)
    console.log(`Verification token for ${data.newEmail}: ${token}`);

    return {
      message: 'Verification email sent. Please check your new email to verify the change.',
      pendingEmail: data.newEmail,
    };
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
