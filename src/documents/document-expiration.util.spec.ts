import {
  EXPIRY_NOTIFICATION_DAYS,
  daysUntilExpiry,
  isExpired,
  dueNotificationMilestone,
  shouldMarkExpired,
} from './document-expiration.util';

describe('document-expiration.util', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  const inDays = (days: number): Date => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  it('exposes the expected notification milestones', () => {
    expect(EXPIRY_NOTIFICATION_DAYS).toEqual([30, 14, 7, 1]);
  });

  describe('daysUntilExpiry', () => {
    it('rounds up remaining days', () => {
      expect(daysUntilExpiry(inDays(7), now)).toBe(7);
    });

    it('is negative once the expiry date has passed', () => {
      expect(daysUntilExpiry(inDays(-3), now)).toBe(-3);
    });
  });

  describe('isExpired', () => {
    it('returns false when there is no expiry date', () => {
      expect(isExpired(null, now)).toBe(false);
    });

    it('returns false before expiry', () => {
      expect(isExpired(inDays(1), now)).toBe(false);
    });

    it('returns true at or after expiry', () => {
      expect(isExpired(now, now)).toBe(true);
      expect(isExpired(inDays(-1), now)).toBe(true);
    });
  });

  describe('dueNotificationMilestone', () => {
    it('returns null when there is no expiry date', () => {
      expect(dueNotificationMilestone(null, now)).toBeNull();
    });

    it('returns the milestone when today is a notification day', () => {
      expect(dueNotificationMilestone(inDays(30), now)).toBe(30);
      expect(dueNotificationMilestone(inDays(1), now)).toBe(1);
    });

    it('returns null when today is not a notification day', () => {
      expect(dueNotificationMilestone(inDays(10), now)).toBeNull();
    });
  });

  describe('shouldMarkExpired', () => {
    it('is true for a past expiry not yet flagged', () => {
      expect(shouldMarkExpired({ expiresAt: inDays(-1), isExpired: false }, now)).toBe(true);
    });

    it('is false when already flagged expired', () => {
      expect(shouldMarkExpired({ expiresAt: inDays(-1), isExpired: true }, now)).toBe(false);
    });

    it('is false when not yet expired', () => {
      expect(shouldMarkExpired({ expiresAt: inDays(5), isExpired: false }, now)).toBe(false);
    });
  });
});
