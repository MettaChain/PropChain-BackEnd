import {
  N1Detector,
  extractCteNames,
  extractPrimaryTable,
  extractTables,
  fingerprintQuery,
  isN1DetectionEnabled,
  n1OptionsFromEnv,
} from './n1-detector';

describe('n1-detector', () => {
  describe('extractPrimaryTable', () => {
    it('handles Prisma-style schema-qualified quoted identifiers', () => {
      const sql =
        'SELECT "public"."User"."id", "public"."User"."email" FROM "public"."User" WHERE "public"."User"."id" = $1 LIMIT $2 OFFSET $3';
      expect(extractPrimaryTable(sql)).toBe('User');
    });

    it('handles unquoted tables', () => {
      expect(extractPrimaryTable('select * from users where id = $1')).toBe('users');
    });

    it('returns the driving table of a joined FROM', () => {
      const sql =
        'SELECT t.* FROM "public"."Property" t INNER JOIN "public"."User" u ON u."id" = t."ownerId" WHERE t."id" = $1';
      expect(extractPrimaryTable(sql)).toBe('Property');
      expect(extractTables(sql)).toEqual(['Property', 'User']);
    });

    it('looks through a FROM (…) subquery to the real table', () => {
      const sql = 'SELECT sub.id FROM (SELECT "id" FROM "public"."Transaction" WHERE "amount" > $1) AS sub';
      expect(extractPrimaryTable(sql)).toBe('Transaction');
    });

    it('ignores CTE names and attributes to the table inside the CTE', () => {
      const sql = `
        WITH recent AS (SELECT * FROM "public"."Order" WHERE "createdAt" > $1),
             "totals" AS (SELECT "userId", sum("amount") FROM recent GROUP BY "userId")
        SELECT * FROM "totals" JOIN recent ON recent."userId" = "totals"."userId"`;
      expect(extractCteNames(sql)).toEqual(new Set(['recent', 'totals']));
      expect(extractTables(sql)).toEqual(['Order']);
      expect(extractPrimaryTable(sql)).toBe('Order');
    });

    it('supports WITH RECURSIVE and column lists', () => {
      const sql =
        'WITH RECURSIVE tree(id, parent) AS (SELECT id, parent FROM "Category" UNION ALL SELECT c.id, c.parent FROM "Category" c JOIN tree ON c.parent = tree.id) SELECT * FROM tree';
      expect(extractTables(sql)).toEqual(['Category', 'Category']);
    });

    it('ignores comments and string literals', () => {
      const sql = `/* FROM "Ghost" */ -- FROM "Phantom"
        SELECT * FROM "public"."Document" WHERE "note" = 'copied FROM Other'`;
      expect(extractTables(sql)).toEqual(['Document']);
    });

    it('ignores FROM inside EXTRACT / SUBSTRING', () => {
      const sql =
        'SELECT EXTRACT(YEAR FROM "createdAt"), SUBSTRING("name" FROM 1 FOR 3) FROM "public"."Session"';
      expect(extractPrimaryTable(sql)).toBe('Session');
    });

    it('handles INSERT, UPDATE and DELETE', () => {
      expect(extractPrimaryTable('INSERT INTO "public"."AuditLog" ("id") VALUES ($1)')).toBe('AuditLog');
      expect(extractPrimaryTable('UPDATE "public"."User" SET "name" = $1 WHERE "id" = $2')).toBe('User');
      expect(extractPrimaryTable('DELETE FROM "public"."Session" WHERE "id" = $1')).toBe('Session');
    });

    it('returns null for statements without a table', () => {
      expect(extractPrimaryTable('SELECT 1')).toBeNull();
      expect(extractPrimaryTable('BEGIN')).toBeNull();
    });
  });

  describe('fingerprintQuery', () => {
    it('maps the same statement with different params to one fingerprint', () => {
      const a = fingerprintQuery('SELECT * FROM "User" WHERE "id" = $1 LIMIT 10');
      const b = fingerprintQuery('SELECT *   FROM "User" WHERE "id" = $1 LIMIT 25');
      expect(a).toBe(b);
    });

    it('collapses IN-lists of any length', () => {
      expect(fingerprintQuery('SELECT * FROM "User" WHERE "id" IN ($1,$2,$3)')).toBe(
        fingerprintQuery('SELECT * FROM "User" WHERE "id" IN ($1, $2)'),
      );
    });

    it('distinguishes different statements on the same table', () => {
      expect(fingerprintQuery('SELECT * FROM "User" WHERE "id" = $1')).not.toBe(
        fingerprintQuery('SELECT * FROM "User" WHERE "email" = $1'),
      );
    });
  });

  describe('N1Detector', () => {
    const q = (id: number) => `SELECT * FROM "public"."Property" WHERE "ownerId" = $1 /* ${id} */`;

    it('fires exactly once when the threshold is reached within the window', () => {
      const detector = new N1Detector({ windowMs: 100, threshold: 5 });
      const results = [0, 10, 20, 30, 40, 50].map((t, i) => detector.record(q(i), 1000 + t));
      expect(results.slice(0, 4)).toEqual([null, null, null, null]);
      expect(results[4]).toMatchObject({ table: 'Property', count: 5, windowMs: 100 });
      expect(results[5]).toBeNull();
    });

    it('does not fire when repetitions are spread beyond the window', () => {
      const detector = new N1Detector({ windowMs: 100, threshold: 3 });
      const results = [0, 60, 120, 180, 240].map((t, i) => detector.record(q(i), t));
      expect(results.every((r) => r === null)).toBe(true);
    });

    it('does not flag a legitimate batch of distinct queries on the same table', () => {
      const detector = new N1Detector({ windowMs: 100, threshold: 3 });
      const batch = [
        'SELECT count(*) FROM "User"',
        'SELECT * FROM "User" WHERE "id" = $1',
        'SELECT * FROM "User" WHERE "email" = $1',
        'SELECT * FROM "User" WHERE "id" IN ($1,$2,$3,$4)',
        'UPDATE "User" SET "lastSeen" = $1 WHERE "id" = $2',
      ];
      expect(batch.map((sql) => detector.record(sql, 0)).every((r) => r === null)).toBe(true);
    });

    it('ignores statements without a table', () => {
      const detector = new N1Detector({ windowMs: 100, threshold: 2 });
      expect(detector.record('SELECT 1', 0)).toBeNull();
      expect(detector.record('SELECT 1', 1)).toBeNull();
      expect(detector.size).toBe(0);
    });

    it('sweeps stale keys once maxKeys is exceeded', () => {
      const detector = new N1Detector({ windowMs: 10, threshold: 5, maxKeys: 2 });
      detector.record('SELECT * FROM "A"', 0);
      detector.record('SELECT * FROM "B"', 0);
      detector.record('SELECT * FROM "C"', 100);
      expect(detector.size).toBe(1);
    });
  });

  describe('isN1DetectionEnabled', () => {
    it('is on by default outside production', () => {
      expect(isN1DetectionEnabled({ NODE_ENV: 'development' })).toBe(true);
      expect(isN1DetectionEnabled({})).toBe(true);
    });

    it('is off by default in production', () => {
      expect(isN1DetectionEnabled({ NODE_ENV: 'production' })).toBe(false);
    });

    it('can be opted into in production with DB_N1_DETECTION=true', () => {
      expect(isN1DetectionEnabled({ NODE_ENV: 'production', DB_N1_DETECTION: 'true' })).toBe(true);
      expect(isN1DetectionEnabled({ NODE_ENV: 'production', DB_N1_DETECTION: '1' })).toBe(true);
    });

    it('can be disabled everywhere with DB_N1_DETECTION=false', () => {
      expect(isN1DetectionEnabled({ NODE_ENV: 'development', DB_N1_DETECTION: 'false' })).toBe(false);
    });
  });

  describe('n1OptionsFromEnv', () => {
    it('uses defaults when unset or invalid', () => {
      expect(n1OptionsFromEnv({})).toEqual({ windowMs: 100, threshold: 5 });
      expect(n1OptionsFromEnv({ DB_N1_WINDOW_MS: 'abc', DB_N1_THRESHOLD: '1' })).toEqual({
        windowMs: 100,
        threshold: 5,
      });
    });

    it('reads overrides', () => {
      expect(n1OptionsFromEnv({ DB_N1_WINDOW_MS: '250', DB_N1_THRESHOLD: '10' })).toEqual({
        windowMs: 250,
        threshold: 10,
      });
    });
  });
});
