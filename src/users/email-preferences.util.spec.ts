import {
  EmailType,
  defaultEmailPreferences,
  mergePreferences,
  isEmailAllowed,
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
} from './email-preferences.util';

describe('email-preferences.util', () => {
  const secret = 'unit-test-secret';

  it('defaults everything on except marketing', () => {
    const prefs = defaultEmailPreferences();
    expect(prefs[EmailType.TRANSACTIONAL]).toBe(true);
    expect(prefs[EmailType.SECURITY_ALERTS]).toBe(true);
    expect(prefs[EmailType.MARKETING]).toBe(false);
  });

  describe('mergePreferences', () => {
    it('applies boolean updates over the current values', () => {
      const merged = mergePreferences(
        { [EmailType.MARKETING]: false },
        { [EmailType.MARKETING]: true, [EmailType.REPORTS]: false },
      );
      expect(merged[EmailType.MARKETING]).toBe(true);
      expect(merged[EmailType.REPORTS]).toBe(false);
    });

    it('ignores non-boolean values in the update', () => {
      const merged = mergePreferences({}, { [EmailType.REPORTS]: undefined as unknown as boolean });
      expect(merged[EmailType.REPORTS]).toBe(true);
    });
  });

  describe('isEmailAllowed', () => {
    it('honours an explicit opt-out', () => {
      expect(
        isEmailAllowed({ [EmailType.PRODUCT_UPDATES]: false }, EmailType.PRODUCT_UPDATES),
      ).toBe(false);
    });

    it('falls back to defaults for unset types', () => {
      expect(isEmailAllowed({}, EmailType.TRANSACTIONAL)).toBe(true);
      expect(isEmailAllowed({}, EmailType.MARKETING)).toBe(false);
    });
  });

  describe('unsubscribe tokens', () => {
    it('verifies a token it generated', () => {
      const token = generateUnsubscribeToken('user-1', EmailType.MARKETING, secret);
      expect(verifyUnsubscribeToken('user-1', EmailType.MARKETING, secret, token)).toBe(true);
    });

    it('rejects a token reused for a different email type', () => {
      const token = generateUnsubscribeToken('user-1', EmailType.MARKETING, secret);
      expect(verifyUnsubscribeToken('user-1', EmailType.REPORTS, secret, token)).toBe(false);
    });

    it('rejects a token for a different user', () => {
      const token = generateUnsubscribeToken('user-1', EmailType.MARKETING, secret);
      expect(verifyUnsubscribeToken('user-2', EmailType.MARKETING, secret, token)).toBe(false);
    });

    it('rejects a malformed token of the wrong length', () => {
      expect(verifyUnsubscribeToken('user-1', EmailType.MARKETING, secret, 'short')).toBe(false);
    });
  });
});
