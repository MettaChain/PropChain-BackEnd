import {
  ReportFrequency,
  ReportType,
  nextRunAt,
  isReportDue,
  toCsvField,
  buildCsv,
} from './report-schedule.util';

describe('report-schedule.util', () => {
  it('defines the required report types', () => {
    expect(Object.values(ReportType)).toEqual(['TRANSACTIONS', 'USERS', 'PROPERTIES', 'FRAUD']);
  });

  describe('nextRunAt', () => {
    // 2026-01-07 is a Wednesday.
    const wed = new Date('2026-01-07T09:30:00.000Z');

    it('daily → next day at midnight UTC', () => {
      expect(nextRunAt(ReportFrequency.DAILY, wed).toISOString()).toBe('2026-01-08T00:00:00.000Z');
    });

    it('weekly → next Monday at midnight UTC', () => {
      expect(nextRunAt(ReportFrequency.WEEKLY, wed).toISOString()).toBe('2026-01-12T00:00:00.000Z');
    });

    it('monthly → first of next month at midnight UTC', () => {
      expect(nextRunAt(ReportFrequency.MONTHLY, wed).toISOString()).toBe(
        '2026-02-01T00:00:00.000Z',
      );
    });

    it('weekly from a Monday rolls to the following Monday', () => {
      const mon = new Date('2026-01-05T00:00:00.000Z');
      expect(nextRunAt(ReportFrequency.WEEKLY, mon).toISOString()).toBe('2026-01-12T00:00:00.000Z');
    });
  });

  describe('isReportDue', () => {
    it('is due when the next run is in the past', () => {
      const past = new Date('2026-01-01T00:00:00.000Z');
      const now = new Date('2026-01-02T00:00:00.000Z');
      expect(isReportDue(past, now)).toBe(true);
    });

    it('is not due when the next run is in the future', () => {
      const future = new Date('2026-01-03T00:00:00.000Z');
      const now = new Date('2026-01-02T00:00:00.000Z');
      expect(isReportDue(future, now)).toBe(false);
    });
  });

  describe('CSV helpers', () => {
    it('escapes fields containing commas, quotes, or newlines', () => {
      expect(toCsvField('plain')).toBe('plain');
      expect(toCsvField('a,b')).toBe('"a,b"');
      expect(toCsvField('say "hi"')).toBe('"say ""hi"""');
      expect(toCsvField(null)).toBe('');
      expect(toCsvField(42)).toBe('42');
    });

    it('builds a CSV document from headers and rows', () => {
      const csv = buildCsv(
        ['id', 'name'],
        [
          [1, 'Alice'],
          [2, 'Bob, Jr'],
        ],
      );
      expect(csv).toBe('id,name\n1,Alice\n2,"Bob, Jr"');
    });
  });
});
