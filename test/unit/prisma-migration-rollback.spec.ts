import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../prisma/migrations');

function getMigrationDirs(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{14}_/.test(d.name))
    .map((d) => d.name)
    .sort();
}

function readSql(dirName: string): string {
  const sqlPath = path.join(MIGRATIONS_DIR, dirName, 'migration.sql');
  return fs.readFileSync(sqlPath, 'utf-8');
}

describe('Prisma migration rollback safety', () => {
  const migrationDirs = getMigrationDirs();

  it('should have at least one migration', () => {
    expect(migrationDirs.length).toBeGreaterThan(0);
  });

  it('every migration.sql should be non-empty', () => {
    for (const dir of migrationDirs) {
      const sql = readSql(dir);
      expect(sql.trim().length).toBeGreaterThan(0);
    }
  });

  it('every forward migration should contain DDL or DML statements', () => {
    for (const dir of migrationDirs) {
      const sql = readSql(dir).toLowerCase();
      const hasDdl = /\b(create|alter|drop|insert|update|delete)\b/.test(sql);
      expect(hasDdl).toBe(true);
    }
  });

  it('no migration should drop a table that a later migration creates', () => {
    const drops = new Map<string, string[]>();
    const creates = new Map<string, string[]>();

    for (const dir of migrationDirs) {
      const sql = readSql(dir);
      const dropMatches = sql.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?(\w+)"?/gi) || [];
      const createMatches =
        sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/gi) || [];

      for (const m of dropMatches) {
        const table = m.replace(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?/i, '').replace(/"?$/i, '');
        if (!drops.has(table)) drops.set(table, []);
        drops.get(table)!.push(dir);
      }
      for (const m of createMatches) {
        const table = m
          .replace(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?/i, '')
          .replace(/"?$/i, '');
        if (!creates.has(table)) creates.set(table, []);
        creates.get(table)!.push(dir);
      }
    }

    for (const [table, dropDirs] of drops) {
      const createDirs = creates.get(table) || [];
      const lastDropIdx = migrationDirs.indexOf(dropDirs[dropDirs.length - 1]);
      const firstCreateIdx = createDirs.length > 0 ? migrationDirs.indexOf(createDirs[0]) : -1;
      if (firstCreateIdx > lastDropIdx) {
        throw new Error(
          `Table "${table}" is dropped in ${dropDirs[dropDirs.length - 1]} but recreated in ${createDirs[0]}`,
        );
      }
    }
  });

  it('no migration should use DROP TYPE on a production enum without IF EXISTS', () => {
    for (const dir of migrationDirs) {
      const sql = readSql(dir);
      const matches = [...sql.matchAll(/DROP\s+TYPE\s+"?(\w+)"?/gi)];
      for (const match of matches) {
        const typeName = match[1];
        if (typeName.endsWith('_old')) continue;
        const hasIfExists = /DROP\s+TYPE\s+IF\s+EXISTS/i.test(match[0]);
        expect(hasIfExists).toBe(true);
      }
    }
  });

  it('should not have excessive migrations sharing a timestamp', () => {
    const timestampCounts = new Map<string, string[]>();
    for (const dir of migrationDirs) {
      const timestamp = dir.substring(0, 14);
      if (!timestampCounts.has(timestamp)) timestampCounts.set(timestamp, []);
      timestampCounts.get(timestamp)!.push(dir);
    }
    for (const [timestamp, dirs] of timestampCounts) {
      if (dirs.length > 5) {
        throw new Error(
          `Timestamp ${timestamp} is shared by ${dirs.length} migrations: ${dirs.join(', ')}`,
        );
      }
    }
  });
});
