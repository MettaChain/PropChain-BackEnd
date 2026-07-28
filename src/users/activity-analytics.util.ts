/**
 * Pure aggregation helpers for activity-log analytics (#963).
 *
 * Side-effect free so aggregation, active-user counts, and retention cutoffs
 * can be unit tested without a database. The analytics endpoints and the
 * retention job feed already-loaded records into these functions.
 */

export interface ActivityRecord {
  userId: string;
  type: string;
  createdAt: Date;
}

export const DEFAULT_RETENTION_DAYS = 90;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Count activity records grouped by their `type`. */
export function aggregateByType(records: ActivityRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    counts[record.type] = (counts[record.type] ?? 0) + 1;
  }
  return counts;
}

/** Number of distinct users active within `days` before `now`. */
export function activeUsers(
  records: ActivityRecord[],
  days: number,
  now: Date = new Date(),
): number {
  const cutoff = now.getTime() - days * MS_PER_DAY;
  const users = new Set<string>();
  for (const record of records) {
    if (record.createdAt.getTime() >= cutoff) {
      users.add(record.userId);
    }
  }
  return users.size;
}

/** Daily active users (distinct users active in the last 24h). */
export function dailyActiveUsers(records: ActivityRecord[], now: Date = new Date()): number {
  return activeUsers(records, 1, now);
}

/** Weekly active users (distinct users active in the last 7 days). */
export function weeklyActiveUsers(records: ActivityRecord[], now: Date = new Date()): number {
  return activeUsers(records, 7, now);
}

/**
 * The retention cutoff date: records older than this should be pruned. Defaults
 * to {@link DEFAULT_RETENTION_DAYS} days before `now`.
 */
export function retentionCutoff(
  now: Date = new Date(),
  retentionDays: number = DEFAULT_RETENTION_DAYS,
): Date {
  return new Date(now.getTime() - retentionDays * MS_PER_DAY);
}

/** Split records into those to keep and those to prune given a retention window. */
export function partitionForRetention(
  records: ActivityRecord[],
  now: Date = new Date(),
  retentionDays: number = DEFAULT_RETENTION_DAYS,
): { keep: ActivityRecord[]; prune: ActivityRecord[] } {
  const cutoff = retentionCutoff(now, retentionDays).getTime();
  const keep: ActivityRecord[] = [];
  const prune: ActivityRecord[] = [];
  for (const record of records) {
    if (record.createdAt.getTime() >= cutoff) {
      keep.push(record);
    } else {
      prune.push(record);
    }
  }
  return { keep, prune };
}
