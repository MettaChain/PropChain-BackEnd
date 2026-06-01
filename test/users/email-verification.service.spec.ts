import { EmailVerificationService } from '../../src/users/email-verification.service';

describe('EmailVerificationService', () => {
  it('resends verification and updates token when pendingEmail exists', async () => {
    const mockPrisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user1', pendingEmail: 'new@example.com' }),
        update: jest.fn().mockResolvedValue(true),
      },
    };

    const mockEmailService: any = {
      sendEmail: jest.fn().mockResolvedValue(undefined),
    };

    const mockRateLimitService: any = {
      checkEndpointRateLimit: jest.fn().mockResolvedValue({ isExceeded: false }),
    };

    const svc = new EmailVerificationService(mockPrisma, mockEmailService, mockRateLimitService);

    const res = await svc.resendVerification('user1');

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user1' } });
    expect(mockPrisma.user.update).toHaveBeenCalled();
    expect(mockEmailService.sendEmail).toHaveBeenCalled();
    expect(res).toEqual({ message: 'Verification email resent' });
  });

  it('throws if no pendingEmail', async () => {
    const mockPrisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user1', pendingEmail: null }),
      },
    };

    const mockEmailService: any = { sendEmail: jest.fn() };
    const mockRateLimitService: any = { checkEndpointRateLimit: jest.fn().mockResolvedValue({ isExceeded: false }) };

    const svc = new EmailVerificationService(mockPrisma, mockEmailService, mockRateLimitService);

    await expect(svc.resendVerification('user1')).rejects.toThrow('No pending email change to resend verification for');
  });

  it('clears expired verification token and throws an informative message', async () => {
    const expiredDate = new Date(Date.now() - 1 * 60 * 60 * 1000);
    const mockPrisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user1',
          pendingEmail: 'new@example.com',
          emailVerificationToken: 'expired-token',
          emailVerificationExpires: expiredDate,
        }),
        update: jest.fn().mockResolvedValue(true),
      },
    };

    const mockEmailService: any = { sendEmail: jest.fn() };
    const mockRateLimitService: any = { checkEndpointRateLimit: jest.fn() };

    const svc = new EmailVerificationService(mockPrisma, mockEmailService, mockRateLimitService);

    await expect(svc.verifyEmailChange('user1', 'expired-token')).rejects.toThrow('Verification token has expired');
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user1' },
      data: {
        pendingEmail: null,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });
  });
});
