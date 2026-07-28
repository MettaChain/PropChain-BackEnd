import {
  ActivityRecord,
  DEFAULT_RETENTION_DAYS,
  aggregateByType,
  activeUsers,
  dailyActiveUsers,
  weeklyActiveUsers,
  retentionCutoff,
  partitionForRetention,
} from './activity-analytics.util';

describe('activity-analytics.util', () => {
  const now = new Date('2026-06-01T00:00:00.000Z');
  const daysAgo = (n: number): Date => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  const records: ActivityRecord[] = [
    { userId: 'u1', type: 'LOGIN', createdAt: daysAgo(0) },
    { userId: 'u1', type: 'LOGIN', createdAt: daysAgo(3) },
    { userId: 'u2', type: 'UPLOAD', createdAt: daysAgo(5) },
    { userId: 'u3', type: 'LOGIN', createdAt: daysAgo(120) },
  ];

  it('aggregates counts by type', () => {
    expect(aggregateByType(records)).toEqual({ LOGIN: 3, UPLOAD: 1 });
  });

  it('counts distinct active users within a window', () => {
    expect(activeUsers(records, 7, now)).toBe(2); // u1, u2
  });

  it('computes daily active users', () => {
    expect(dailyActiveUsers(records, now)).toBe(1); // only u1 today
  });

  it('computes weekly active users', () => {
    expect(weeklyActiveUsers(records, now)).toBe(2); // u1, u2
  });

  it('derives the retention cutoff from the default window', () => {
    const cutoff = retentionCutoff(now);
    expect(cutoff.toISOString()).toBe('2026-03-03T00:00:00.000Z');
    expect(DEFAULT_RETENTION_DAYS).toBe(90);
  });

  it('partitions records into keep and prune by retention window', () => {
    const { keep, prune } = partitionForRetention(records, now);
    expect(keep).toHaveLength(3);
    expect(prune).toHaveLength(1);
    expect(prune[0].userId).toBe('u3');
  });
});
