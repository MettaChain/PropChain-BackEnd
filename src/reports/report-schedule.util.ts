/**
 * Pure helpers for scheduled report generation (#966).
 *
 * Side-effect free so schedule resolution and CSV assembly can be unit tested
 * without a scheduler or mailer. The report job uses these to compute the next
 * run time for a configured frequency and to build CSV attachments.
 */

export enum ReportFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

export enum ReportType {
  TRANSACTIONS = 'TRANSACTIONS',
  USERS = 'USERS',
  PROPERTIES = 'PROPERTIES',
  FRAUD = 'FRAUD',
}

/**
 * Compute the next UTC run time (00:00) after `from` for the given frequency.
 * - DAILY: next day
 * - WEEKLY: next Monday
 * - MONTHLY: first day of next month
 */
export function nextRunAt(frequency: ReportFrequency, from: Date = new Date()): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const day = from.getUTCDate();

  switch (frequency) {
    case ReportFrequency.DAILY:
      return new Date(Date.UTC(year, month, day + 1));
    case ReportFrequency.WEEKLY: {
      const dow = from.getUTCDay(); // 0 = Sunday, 1 = Monday
      const daysUntilMonday = (8 - dow) % 7 || 7;
      return new Date(Date.UTC(year, month, day + daysUntilMonday));
    }
    case ReportFrequency.MONTHLY:
      return new Date(Date.UTC(year, month + 1, 1));
    default:
      return new Date(Date.UTC(year, month, day + 1));
  }
}

/** True when a scheduled report is due (its next run time is at or before now). */
export function isReportDue(nextRun: Date, now: Date = new Date()): boolean {
  return nextRun.getTime() <= now.getTime();
}

/** Escape a single CSV field per RFC 4180. */
export function toCsvField(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Build a CSV document from a header row and data rows. */
export function buildCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(toCsvField).join(',')];
  for (const row of rows) {
    lines.push(row.map(toCsvField).join(','));
  }
  return lines.join('\n');
}
