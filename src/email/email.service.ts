import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailService {
  constructor(private readonly configService: ConfigService) {}

  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    const resetUrl = `${this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000')}/reset-password?token=${resetToken}`;

    const emailOptions: EmailOptions = {
      to: email,
      subject: 'Password Reset - PropChain',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>You have requested to reset your password for your PropChain account.</p>
          <p>Please click the link below to reset your password:</p>
          <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">
            Reset Password
          </a>
          <p>If you didn't request this password reset, please ignore this email.</p>
          <p>This link will expire in 1 hour for security reasons.</p>
          <p>Best regards,<br>The PropChain Team</p>
        </div>
      `,
      text: `
        Password Reset Request

        You have requested to reset your password for your PropChain account.

        Please use the following link to reset your password:
        ${resetUrl}

        If you didn't request this password reset, please ignore this email.

        This link will expire in 1 hour for security reasons.

        Best regards,
        The PropChain Team
      `,
    };

    await this.sendEmail(emailOptions);
  }

  private async sendEmail(options: EmailOptions): Promise<void> {
    // For now, we'll just log the email. In production, you would integrate with
    // an email service like SendGrid, Mailgun, AWS SES, etc.

    console.log('📧 Sending email:');
    console.log(`To: ${options.to}`);
    console.log(`Subject: ${options.subject}`);
    console.log(`HTML: ${options.html.substring(0, 200)}...`);
    console.log(`Text: ${options.text?.substring(0, 200)}...`);

    // TODO: Integrate with actual email service
    // Example with nodemailer:
    // const transporter = nodemailer.createTransporter({...});
    // await transporter.sendMail({
    //   from: this.configService.get('EMAIL_FROM'),
    //   to: options.to,
    //   subject: options.subject,
    //   html: options.html,
    //   text: options.text,
    // });
  }
}
