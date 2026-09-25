import {
  checkSqlForDestructiveChanges,
  findDuplicateTableCreations,
  hasReviewedDestructiveApproval,
} from './validate-migrations';

describe('migration SQL validation', () => {
  it.each([
    ['enum value addition', `ALTER TYPE "JobStatus" ADD VALUE 'ARCHIVED';`, 'ALTER TYPE ... VALUE'],
    ['enum value removal', `ALTER TYPE "JobStatus" DROP VALUE 'ARCHIVED';`, 'ALTER TYPE ... VALUE'],
    ['enum type replacement', 'DROP TYPE "JobStatus";', 'DROP TYPE'],
    ['unfiltered delete', 'DELETE FROM users;', 'DELETE FROM without WHERE'],
    ['unfiltered update', 'UPDATE users SET active = false;', 'UPDATE without WHERE'],
    ['database drop', 'DROP DATABASE propchain;', 'DROP DATABASE'],
    ['reindex', 'REINDEX TABLE users;', 'REINDEX'],
  ])('detects %s', (_name, sql, expected) => {
    expect(checkSqlForDestructiveChanges(sql)).toContain(expect.stringContaining(expected));
  });

  it('detects destructive SQL when comments split tokens', () => {
    expect(checkSqlForDestructiveChanges('DROP /* reviewed later */ TABLE users;')).toContain(
      expect.stringContaining('DROP TABLE'),
    );
  });

  it('ignores SQL in line comments, block comments, and string literals', () => {
    const sql = `
      -- DROP TABLE ignored;
      /* ALTER TABLE users DROP COLUMN email; */
      SELECT 'DELETE FROM users' AS note;
    `;
    expect(checkSqlForDestructiveChanges(sql)).toEqual([]);
  });

  it('allows explicitly scoped DML and detects DML nested in a CTE', () => {
    expect(checkSqlForDestructiveChanges('DELETE FROM users WHERE id = 1;')).toEqual([]);
    expect(checkSqlForDestructiveChanges('UPDATE users SET active = true WHERE id = 1;')).toEqual(
      [],
    );
    expect(
      checkSqlForDestructiveChanges(
        'WITH targets AS (SELECT id FROM users WHERE active = false) DELETE FROM users;',
      ),
    ).toContain(expect.stringContaining('DELETE FROM without WHERE'));
  });

  it('requires a line-comment bypass with both approver and reason', () => {
    expect(hasReviewedDestructiveApproval('-- validate-migrations: allow-destructive')).toBe(false);
    expect(
      hasReviewedDestructiveApproval(
        '-- validate-migrations: allow-destructive approved-by: db-reviewer reason: approved data retention migration',
      ),
    ).toBe(true);
    expect(
      hasReviewedDestructiveApproval(
        '/* -- validate-migrations: allow-destructive approved-by: db-reviewer reason: approved */',
      ),
    ).toBe(false);
  });

  it('detects a table created by multiple migrations but ignores comments', () => {
    expect(
      findDuplicateTableCreations([
        { file: 'first.sql', content: 'CREATE TABLE "export_jobs" (id TEXT);' },
        { file: 'second.sql', content: 'CREATE TABLE IF NOT EXISTS export_jobs (id TEXT);' },
      ]),
    ).toEqual(['  - Table "export_jobs" is created in multiple migrations: first.sql, second.sql']);
    expect(
      findDuplicateTableCreations([
        { file: 'first.sql', content: '/* CREATE TABLE export_jobs (id TEXT); */' },
        { file: 'second.sql', content: 'CREATE TABLE export_jobs (id TEXT);' },
      ]),
    ).toEqual([]);
  });
});
