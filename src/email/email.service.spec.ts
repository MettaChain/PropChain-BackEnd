import { EmailService } from './email.service';

describe('EmailService.handleBounce', () => {
  it('disables email notifications on hard bounce', async () => {
    const prisma: any = {
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
      { get: jest.fn().mockReturnValue('http://localhost:3000/api') } as any,
      prisma,
      { createEmailEngagement: jest.fn() } as any,
      { add: jest.fn() } as any,
      { translate: jest.fn().mockReturnValue('test') } as any,
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
