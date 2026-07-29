import { EmailService } from './email.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { TrackingService } from '../tracking/tracking.service';
import { I18nService } from '../i18n/i18n.service';
import { Queue } from 'bullmq';

describe('EmailService.handleBounce', () => {
  it('disables email notifications on hard bounce', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      emailBounce: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      userPreferences: {
        upsert: jest.fn().mockResolvedValue(undefined),
      },
    };

    const service = new EmailService(
      { get: jest.fn().mockReturnValue('http://localhost:3000/api') } as unknown as ConfigService,
      prisma as unknown as PrismaService,
      { createEmailEngagement: jest.fn() } as unknown as TrackingService,
      { translate: jest.fn((key) => key) } as unknown as I18nService,
      { add: jest.fn() } as unknown as Queue,
    );

    await service.handleBounce('test@example.com', 'HARD', 'Mailbox disabled', {
      id: 'evt-1',
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
    expect(prisma.emailBounce.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        email: 'test@example.com',
        bounceType: 'HARD',
        reason: 'Mailbox disabled',
        rawEvent: { id: 'evt-1' },
      },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { emailStatus: 'BOUNCED' },
    });
    expect(prisma.userPreferences.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      update: { emailNotifications: false },
      create: {
        userId: 'user-1',
        emailNotifications: false,
      },
    });
  });
});
