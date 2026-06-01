import { LoginRateLimitService } from './login-rate-limit.service';

describe('LoginRateLimitService', () => {
  let service: LoginRateLimitService;
  let mockPrisma: any;

  const email = 'test@example.com';
  const ip = '1.2.3.4';

  beforeEach(() => {
    mockPrisma = {
      loginAttempt: {
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new LoginRateLimitService(mockPrisma);
  });

  describe('isAccountLocked', () => {
    it('returns true when a locked attempt exists', async () => {
      mockPrisma.loginAttempt.findFirst.mockResolvedValue({ id: '1' });
      expect(await service.isAccountLocked(email)).toBe(true);
    });

    it('returns false when no locked attempt exists', async () => {
      mockPrisma.loginAttempt.findFirst.mockResolvedValue(null);
      expect(await service.isAccountLocked(email)).toBe(false);
    });
  });

  describe('recordFailedAttempt', () => {
    it('returns false and records attempt when below threshold', async () => {
      mockPrisma.loginAttempt.count.mockResolvedValue(2); // 2 previous + 1 = 3, below 5
      const shouldLock = await service.recordFailedAttempt(email, ip);
      expect(shouldLock).toBe(false);
      expect(mockPrisma.loginAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email, ipAddress: ip, success: false, lockedOut: false }),
        }),
      );
    });

    it('returns true and locks account when threshold reached', async () => {
      mockPrisma.loginAttempt.count.mockResolvedValue(4); // 4 previous + 1 = 5, equals threshold
      const shouldLock = await service.recordFailedAttempt(email, ip);
      expect(shouldLock).toBe(true);
      expect(mockPrisma.loginAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lockedOut: true, unlockAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('recordSuccessfulAttempt', () => {
    it('records a successful login attempt', async () => {
      await service.recordSuccessfulAttempt(email, ip);
      expect(mockPrisma.loginAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email, success: true, lockedOut: false }),
        }),
      );
    });
  });

  describe('unlockAccount', () => {
    it('clears locked attempts for the account', async () => {
      await service.unlockAccount(email);
      expect(mockPrisma.loginAttempt.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ email: email.toLowerCase(), lockedOut: true }),
          data: expect.objectContaining({ lockedOut: false, unlockAt: null }),
        }),
      );
    });
  });

  describe('getLockoutInfo', () => {
    it('returns null when no attempts exist', async () => {
      mockPrisma.loginAttempt.count.mockResolvedValue(0);
      mockPrisma.loginAttempt.findFirst.mockResolvedValue(null);
      expect(await service.getLockoutInfo(email)).toBeNull();
    });

    it('returns lockout info when account is locked', async () => {
      const unlockAt = new Date(Date.now() + 30 * 60 * 1000);
      mockPrisma.loginAttempt.count.mockResolvedValue(5);
      mockPrisma.loginAttempt.findFirst
        .mockResolvedValueOnce({ id: '1' }) // isAccountLocked
        .mockResolvedValueOnce({ unlockAt }); // getLockoutInfo detail
      const info = await service.getLockoutInfo(email);
      expect(info).not.toBeNull();
      expect(info!.isLocked).toBe(true);
      expect(info!.failedAttempts).toBe(5);
      expect(info!.remainingLockoutMinutes).toBeGreaterThan(0);
    });
  });
});
