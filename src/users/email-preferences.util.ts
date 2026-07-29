import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Pure helpers for granular email preferences and one-click unsubscribe (#965).
 *
 * Side-effect free so preference resolution and unsubscribe-token signing can
 * be unit tested without a database or mailer.
 */

export enum EmailType {
  TRANSACTIONAL = 'TRANSACTIONAL',
  MARKETING = 'MARKETING',
  SECURITY_ALERTS = 'SECURITY_ALERTS',
  PRODUCT_UPDATES = 'PRODUCT_UPDATES',
  DOCUMENT_EXPIRY = 'DOCUMENT_EXPIRY',
  REPORTS = 'REPORTS',
}

export type EmailPreferences = Record<EmailType, boolean>;

/**
 * Default preferences: everything on except marketing (opt-in). Security
 * alerts are always on by default and cannot be silently defaulted off.
 */
export function defaultEmailPreferences(): EmailPreferences {
  return {
    [EmailType.TRANSACTIONAL]: true,
    [EmailType.MARKETING]: false,
    [EmailType.SECURITY_ALERTS]: true,
    [EmailType.PRODUCT_UPDATES]: true,
    [EmailType.DOCUMENT_EXPIRY]: true,
    [EmailType.REPORTS]: true,
  };
}

/** Merge a partial preference update over the defaults, ignoring unknown keys. */
export function mergePreferences(
  current: Partial<EmailPreferences>,
  update: Partial<EmailPreferences>,
): EmailPreferences {
  const base = { ...defaultEmailPreferences(), ...current };
  for (const type of Object.values(EmailType)) {
    const value = update[type];
    if (typeof value === 'boolean') {
      base[type] = value;
    }
  }
  return base;
}

/** True when the user currently accepts email of the given type. */
export function isEmailAllowed(preferences: Partial<EmailPreferences>, type: EmailType): boolean {
  const merged = { ...defaultEmailPreferences(), ...preferences };
  return merged[type] === true;
}

/**
 * Deterministic, verifiable unsubscribe token for email-based opt-out links.
 * Binds the user and email type so a token cannot be reused for another type.
 */
export function generateUnsubscribeToken(userId: string, type: EmailType, secret: string): string {
  return createHmac('sha256', secret).update(`${userId}:${type}`).digest('hex');
}

/** Constant-time verification of an unsubscribe token. */
export function verifyUnsubscribeToken(
  userId: string,
  type: EmailType,
  secret: string,
  token: string,
): boolean {
  const expected = generateUnsubscribeToken(userId, type, secret);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(token);
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, actualBuf);
}
