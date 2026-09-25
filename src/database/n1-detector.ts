/**
 * N+1 query detector (Issue #911).
 *
 * Pure, dependency-free helpers used by PrismaService to spot the same query
 * shape being fired against the same table many times in a short window —
 * the classic signature of an N+1 access pattern.
 *
 * Kept separate from PrismaService so the SQL classification and windowing
 * logic can be unit tested without a database.
 */

export interface N1DetectorOptions {
  /** Rolling window length in milliseconds. */
  windowMs: number;
  /** Number of repetitions within the window that triggers a detection. */
  threshold: number;
  /** Upper bound on tracked keys before stale entries are swept. */
  maxKeys?: number;
}

export interface N1Detection {
  table: string;
  count: number;
  windowMs: number;
  fingerprint: string;
}

export const N1_DEFAULT_WINDOW_MS = 100;
export const N1_DEFAULT_THRESHOLD = 5;
const N1_DEFAULT_MAX_KEYS = 1000;

/** SQL functions whose argument syntax contains FROM but is not a table reference. */
const FROM_KEYWORD_FUNCTIONS = /\b(?:EXTRACT|SUBSTRING|TRIM|POSITION|OVERLAY)\s*\([^()]*\)/gi;

/** A possibly schema-qualified, possibly quoted identifier, e.g. "public"."User". */
const IDENT = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][\w$]*)`;
const QUALIFIED_IDENT = String.raw`${IDENT}(?:\s*\.\s*${IDENT})*`;

const TABLE_REF = new RegExp(
  String.raw`\b(FROM|JOIN|INTO|UPDATE)\s+(\(|${QUALIFIED_IDENT})`,
  'gi',
);
const CTE_NAME = new RegExp(
  String.raw`(?:\bWITH(?:\s+RECURSIVE)?|,)\s*(${IDENT})\s*(?:\([^)]*\)\s*)?AS\s*(?:NOT\s+)?(?:MATERIALIZED\s*)?\(`,
  'gi',
);

/** Remove comments and string literals so they cannot produce false matches. */
export function stripSqlNoise(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(FROM_KEYWORD_FUNCTIONS, ' ');
}

/** Last segment of a (schema-qualified) identifier, with quotes removed. */
function unquote(ident: string): string {
  const match = ident.match(/(?:"((?:[^"]|"")+)"|([A-Za-z_][\w$]*))\s*$/);
  if (!match) return ident.trim();
  return match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2];
}

/** Names defined by a leading WITH clause; references to these are not real tables. */
export function extractCteNames(sql: string): Set<string> {
  const cleaned = stripSqlNoise(sql);
  const names = new Set<string>();
  if (!/^\s*WITH\b/i.test(cleaned)) return names;
  for (const match of cleaned.matchAll(CTE_NAME)) {
    names.add(unquote(match[1]).toLowerCase());
  }
  return names;
}

/**
 * Return every real table referenced by FROM / JOIN / INTO / UPDATE, in order
 * of appearance, with schema qualifiers dropped. Subquery openings and CTE
 * names are skipped.
 */
export function extractTables(sql: string): string[] {
  const cleaned = stripSqlNoise(sql);
  const ctes = extractCteNames(sql);
  const tables: string[] = [];
  for (const match of cleaned.matchAll(TABLE_REF)) {
    const target = match[2];
    if (target === '(') continue;
    const name = unquote(target);
    if (ctes.has(name.toLowerCase())) continue;
    tables.push(name);
  }
  return tables;
}

/**
 * The table an N+1 warning should be attributed to: the first real table
 * referenced by the statement (the driving table for SELECT, the target for
 * INSERT/UPDATE/DELETE).
 */
export function extractPrimaryTable(sql: string): string | null {
  return extractTables(sql)[0] ?? null;
}

/**
 * Normalise a query to its shape so the same statement with different
 * parameters maps to the same key, while distinct statements against the same
 * table (a legitimate batch) do not.
 */
export function fingerprintQuery(sql: string): string {
  return stripSqlNoise(sql)
    .replace(/\$\d+/g, '?')
    .replace(/\b\d+(?:\.\d+)?\b/g, '?')
    .replace(/''/g, '?')
    .replace(/\(\s*\?(?:\s*,\s*\?)*\s*\)/g, '(?)')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Rolling-window counter. `record` returns a detection exactly once per burst:
 * when a (table, query shape) pair reaches the threshold within the window.
 */
export class N1Detector {
  private readonly windowMs: number;
  private readonly threshold: number;
  private readonly maxKeys: number;
  private readonly window = new Map<string, number[]>();

  constructor(options: Partial<N1DetectorOptions> = {}) {
    this.windowMs = options.windowMs ?? N1_DEFAULT_WINDOW_MS;
    this.threshold = options.threshold ?? N1_DEFAULT_THRESHOLD;
    this.maxKeys = options.maxKeys ?? N1_DEFAULT_MAX_KEYS;
  }

  record(sql: string, now: number = Date.now()): N1Detection | null {
    const table = extractPrimaryTable(sql);
    if (!table) return null;

    const fingerprint = fingerprintQuery(sql);
    const key = `${table}\u0000${fingerprint}`;
    const timestamps = (this.window.get(key) ?? []).filter((t) => now - t < this.windowMs);
    timestamps.push(now);
    this.window.set(key, timestamps);

    if (this.window.size > this.maxKeys) this.sweep(now);

    if (timestamps.length === this.threshold) {
      return { table, count: timestamps.length, windowMs: this.windowMs, fingerprint };
    }
    return null;
  }

  /** Number of tracked (table, shape) keys — exposed for tests. */
  get size(): number {
    return this.window.size;
  }

  private sweep(now: number): void {
    for (const [key, timestamps] of this.window) {
      if (timestamps.every((t) => now - t >= this.windowMs)) this.window.delete(key);
    }
  }
}

/**
 * Resolve whether N+1 detection is active.
 *
 * DB_N1_DETECTION=true  → on (including production — opt-in)
 * DB_N1_DETECTION=false → off everywhere
 * unset                 → on outside production, off in production
 */
export function isN1DetectionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.DB_N1_DETECTION?.trim().toLowerCase();
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;
  return env.NODE_ENV !== 'production';
}

export function n1OptionsFromEnv(env: NodeJS.ProcessEnv = process.env): N1DetectorOptions {
  const windowMs = parseInt(env.DB_N1_WINDOW_MS ?? '', 10);
  const threshold = parseInt(env.DB_N1_THRESHOLD ?? '', 10);
  return {
    windowMs: windowMs > 0 ? windowMs : N1_DEFAULT_WINDOW_MS,
    threshold: threshold > 1 ? threshold : N1_DEFAULT_THRESHOLD,
  };
}
