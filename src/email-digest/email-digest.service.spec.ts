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

interface MockPrisma {
  digestPreference: {
    upsert: jest.Mock;
    findUnique: jest.Mock;
  };
}

describe('EmailDigestService', () => {
  let service: EmailDigestService;
  let prisma: MockPrisma;

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
      },
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
    expect(prisma.digestPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
    expect(result.userId).toBe('u1');
  });
});
