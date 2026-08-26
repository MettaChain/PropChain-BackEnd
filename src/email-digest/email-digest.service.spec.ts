import { EmailDigestService } from './email-digest.service';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';

describe('EmailDigestService', () => {
  let service: EmailDigestService;
  let prisma: jest.Mocked<Partial<PrismaService>>;

  beforeEach(() => {
    prisma = {
      digestPreference: {
        upsert: jest.fn().mockResolvedValue({ userId: 'u1', enabled: true, frequency: 'DAILY', unsubscribeToken: 'tok' }),
        findUnique: jest.fn().mockResolvedValue(null),
      } as any,
    };
    service = new EmailDigestService(
      prisma as unknown as PrismaService,
      { sendEmail: jest.fn() } as unknown as EmailService,
      { get: jest.fn().mockReturnValue('') } as unknown as ConfigService,
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
});