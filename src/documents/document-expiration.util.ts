/**
 * Pure helpers for the document expiration workflow (#962).
 *
 * These are side-effect free so the scheduled job and notification logic can be
 * unit tested without a database. The daily cron uses them to decide which
 * documents to notify about, which to mark EXPIRED, and how many days remain.
 */

/** Days before expiry at which the owner should be notified. */
export const EXPIRY_NOTIFICATION_DAYS: readonly number[] = [30, 14, 7, 1];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days from `now` until `expiresAt`, rounded up. Negative when the
 * expiry date is in the past.
 */
export function daysUntilExpiry(expiresAt: Date, now: Date = new Date()): number {
  return Math.ceil((expiresAt.getTime() - now.getTime()) / MS_PER_DAY);
}

/** True when the document has reached or passed its expiry date. */
export function isExpired(expiresAt: Date | null, now: Date = new Date()): boolean {
  if (!expiresAt) {
    return false;
  }
  return expiresAt.getTime() <= now.getTime();
}

/**
 * Returns the notification milestone (30/14/7/1) that falls due today, or
 * `null` if today is not a notification day. Used to avoid double-notifying.
 */
export function dueNotificationMilestone(
  expiresAt: Date | null,
  now: Date = new Date(),
): number | null {
  if (!expiresAt) {
    return null;
  }
  const remaining = daysUntilExpiry(expiresAt, now);
  return EXPIRY_NOTIFICATION_DAYS.includes(remaining) ? remaining : null;
}

/**
 * Whether a document should transition to EXPIRED: it has an expiry date in the
 * past and is not already flagged expired.
 */
export function shouldMarkExpired(
  document: { expiresAt: Date | null; isExpired: boolean },
  now: Date = new Date(),
): boolean {
  return !document.isExpired && isExpired(document.expiresAt, now);
}
