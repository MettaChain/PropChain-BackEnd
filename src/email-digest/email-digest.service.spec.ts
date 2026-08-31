jest.mock('@prisma/client', () => ({
  ...jest.requireActual('@prisma/client'),
  DigestFrequency: {
    DAILY: 'DAILY',
    WEEKLY: 'WEEKLY',
  },
}));

import { EmailDigestService } from './email-digest.service';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';

describe('EmailDigestService', () => {
  let service: EmailDigestService;
  let prisma: jest.Mocked<Partial<PrismaService>>;
  let emailService: { sendEmail: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    prisma = {
      digestPreference: {
        upsert: jest.fn().mockResolvedValue({
          userId: 'u1',
          enabled: true,
          frequency: 'DAILY',
          unsubscribeToken: 'tok',
        }),
        findUnique: jest.fn().mockResolvedValue(null),
      } as any,
      notification: {
        findMany: jest.fn().mockResolvedValue([
          {
            title: 'New property update',
            message: 'A property has new activity',
            type: 'INFO',
            createdAt: new Date('2026-08-31T12:00:00.000Z'),
          },
        ]),
      } as any,
    };
    emailService = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    configService = { get: jest.fn().mockReturnValue('https://api.propchain.example/api') };

    service = new EmailDigestService(
      prisma as unknown as PrismaService,
      emailService as unknown as EmailService,
      configService as unknown as ConfigService,
    );
  });

  it('getOrCreatePreference creates preference for new user', async () => {
    const result = await service.getOrCreatePreference('u1');
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(prisma.digestPreference!.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
    expect(result.userId).toBe('u1');
  });

  it('uses configured API_URL for digest unsubscribe links', async () => {
    await service['sendDigestForUser'](
      { id: 'u1', email: 'user@example.com', firstName: 'User' },
      new Date('2026-08-30T12:00:00.000Z'),
      'token-123',
    );

    expect(emailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining(
          'https://api.propchain.example/api/email-digest/unsubscribe?token=token-123',
        ),
      }),
    );
  });

  it('fails when API_URL is missing for digest unsubscribe links', async () => {
    configService.get.mockReturnValue(undefined);

    await expect(
      service['sendDigestForUser'](
        { id: 'u1', email: 'user@example.com', firstName: 'User' },
        new Date('2026-08-30T12:00:00.000Z'),
        'token-123',
      ),
    ).rejects.toThrow('API_URL environment variable is not set');
  });
});
