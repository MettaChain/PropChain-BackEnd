/**
 * Prisma Migration Safety Validator
 *
 * Statically analyses Prisma migration SQL for operations that are unsafe to
 * run against a production database:
 *
 *   Destructive operations
 *     drop-table, drop-column, drop-schema, truncate, drop-type,
 *     delete-without-where
 *   Column type changes
 *     alter-column-type          (ALTER COLUMN ... TYPE / SET DATA TYPE)
 *   Data-loss / failure risks
 *     add-required-column        (NOT NULL column without DEFAULT → fails on non-empty tables)
 *     set-not-null               (fails if existing rows contain NULL, unless backfilled first)
 *     add-unique                 (fails if duplicates exist)
 *     enum-recreate              (Prisma recreates enums to remove values → existing rows may break)
 *     rename                     (RENAME TABLE/COLUMN breaks code still running the old schema)
 *     drop-constraint / drop-index
 *     update-data / delete-data  (data rewrites inside a schema migration)
 *     blocking-index             (CREATE INDEX without CONCURRENTLY on an existing table)
 *   Rollback
 *     missing-rollback           (risky migration without a down.sql / rollback.sql next to it)
 *     empty-rollback             (rollback file exists but contains no statements)
 *
 * Prisma Migrate has no built-in down migrations, so the convention checked here
 * is a `down.sql` (or `rollback.sql`) inside the migration folder, e.g. generated with:
 *   npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma \
 *     --to-schema-datasource prisma/schema.prisma --script > prisma/migrations/<name>/down.sql
 *
 * A finding can be acknowledged inside migration.sql with a reason:
 *   -- migration-safety: allow drop-column -- column unused since v2.3, data archived
 *
 * Usage:
 *   npx ts-node api-extensions/scripts/validate-migration-safety.ts [options] [migration-name ...]
 *
 * Options:
 *   --dir <path>          Migrations directory (default: prisma/migrations)
 *   --since <name>        Only check migrations whose folder name sorts after <name>
 *   --require-rollback    Require a rollback file for every migration, not just risky ones
 *   --strict              Treat warnings as failures
 *   --json <file>         Write the full report as JSON
 *
 * Exit codes:
 *   0  no blocking findings
 *   1  errors found (or warnings with --strict)
 *   2  fatal error
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Severity = 'error' | 'warning' | 'info';

export type RuleId =
  | 'drop-table'
  | 'drop-column'
  | 'drop-schema'
  | 'truncate'
  | 'drop-type'
  | 'delete-without-where'
  | 'alter-column-type'
  | 'add-required-column'
  | 'set-not-null'
  | 'add-unique'
  | 'enum-recreate'
  | 'rename'
  | 'drop-constraint'
  | 'drop-index'
  | 'update-data'
  | 'delete-data'
  | 'blocking-index'
  | 'missing-rollback'
  | 'empty-rollback';

export interface Finding {
  rule: RuleId;
  severity: Severity;
  migration: string;
  line: number;
  message: string;
  statement?: string;
  /** Set when the rule was acknowledged with a `migration-safety: allow` directive. */
  allowed?: boolean;
}

export interface SqlStatement {
  text: string;
  /** 1-based line where the statement starts. */
  line: number;
}

export interface MigrationReport {
  migration: string;
  rollbackFile: string | null;
  findings: Finding[];
}

export interface SafetyReport {
  generatedAt: string;
  directory: string;
  strict: boolean;
  migrations: MigrationReport[];
  summary: { migrations: number; errors: number; warnings: number; info: number; allowed: number };
}

// ---------------------------------------------------------------------------
// SQL splitting
// ---------------------------------------------------------------------------

/**
 * Split SQL into statements, ignoring `--` / `/* *\/` comments and semicolons inside
 * single-quoted strings, double-quoted identifiers and `$tag$` dollar-quoted bodies.
 */
export function splitStatements(sql: string): SqlStatement[] {
  const statements: SqlStatement[] = [];
  let current = '';
  let startLine = 1;
  let line = 1;
  let i = 0;

  const push = () => {
    const text = current.replace(/\s+/g, ' ').trim();
    if (text) statements.push({ text, line: startLine });
    current = '';
  };

  while (i < sql.length) {
    const char = sql[i];
    const rest = sql.slice(i);

    if (!current.trim()) startLine = line;

    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', i + 2);
      const block = sql.slice(i, end === -1 ? sql.length : end + 2);
      line += (block.match(/\n/g) ?? []).length;
      current += ' ';
      i += block.length;
      continue;
    }
    if (char === "'" || char === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === char && sql[j + 1] === char) j += 2;
        else if (sql[j] === char) break;
        else j += 1;
      }
      const quoted = sql.slice(i, j + 1);
      line += (quoted.match(/\n/g) ?? []).length;
      current += quoted;
      i = j + 1;
      continue;
    }
    const dollar = /^\$([A-Za-z_]\w*)?\$/.exec(rest);
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      const body = sql.slice(i, end === -1 ? sql.length : end + tag.length);
      line += (body.match(/\n/g) ?? []).length;
      current += body;
      i += body.length;
      continue;
    }
    if (char === ';') {
      push();
      i += 1;
      continue;
    }
    if (char === '\n') line += 1;
    current += char;
    i += 1;
  }
  push();
  return statements;
}

/** Parse `-- migration-safety: allow rule-a, rule-b` directives. */
export function parseAllowDirectives(sql: string): Set<RuleId> {
  const allowed = new Set<RuleId>();
  for (const match of sql.matchAll(/--\s*migration-safety:\s*allow\s+([a-z\-,\s]+?)(?:--|$)/gim)) {
    match[1]
      .split(/[,\s]+/)
      .filter(Boolean)
      .forEach((rule) => allowed.add(rule as RuleId));
  }
  return allowed;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const IDENT = String.raw`(?:"(?:[^"]|"")+"|[\w$]+)`;
const QUALIFIED = String.raw`${IDENT}(?:\s*\.\s*${IDENT})?`;

function unquote(identifier: string): string {
  const last = identifier.split('.').pop() ?? identifier;
  return last.trim().replace(/^"|"$/g, '').replace(/""/g, '"');
}

function tableOf(statement: string): string | undefined {
  const match = new RegExp(
    String.raw`^(?:ALTER\s+TABLE|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?(${QUALIFIED})`,
    'i',
  ).exec(statement);
  return match ? unquote(match[1]) : undefined;
}

interface Context {
  createdTables: Set<string>;
  /** Tables that had rows UPDATEd earlier in the migration (treated as a backfill). */
  backfilledTables: Set<string>;
}

type Rule = (
  statement: string,
  context: Context,
) => Array<{ rule: RuleId; severity: Severity; message: string }>;

const RULES: Rule[] = [
  (s) =>
    /^DROP\s+TABLE\b/i.test(s)
      ? [
          {
            rule: 'drop-table',
            severity: 'error',
            message: 'DROP TABLE permanently deletes the table and its data',
          },
        ]
      : [],
  (s) =>
    /^DROP\s+(SCHEMA|DATABASE)\b/i.test(s)
      ? [
          {
            rule: 'drop-schema',
            severity: 'error',
            message: 'DROP SCHEMA/DATABASE deletes every object it contains',
          },
        ]
      : [],
  (s) =>
    /^TRUNCATE\b/i.test(s)
      ? [{ rule: 'truncate', severity: 'error', message: 'TRUNCATE deletes all rows' }]
      : [],
  (s) =>
    /^DROP\s+TYPE\b/i.test(s)
      ? [
          {
            rule: 'drop-type',
            severity: 'error',
            message: 'DROP TYPE fails or cascades if columns still use the type',
          },
        ]
      : [],
  (s) => {
    if (!/^DELETE\s+FROM\b/i.test(s)) return [];
    return /\bWHERE\b/i.test(s)
      ? [
          {
            rule: 'delete-data',
            severity: 'warning',
            message: 'DELETE inside a schema migration removes data irreversibly',
          },
        ]
      : [
          {
            rule: 'delete-without-where',
            severity: 'error',
            message: 'DELETE without WHERE removes every row',
          },
        ];
  },
  (s, context) => {
    if (!/^UPDATE\b/i.test(s)) return [];
    const table = tableOf(s);
    if (table) context.backfilledTables.add(table);
    return [
      {
        rule: 'update-data',
        severity: 'info',
        message: 'data rewrite inside a schema migration — make sure it is reversible',
      },
    ];
  },
  (s) => {
    if (!/^ALTER\s+TABLE\b/i.test(s)) return [];
    const findings: ReturnType<Rule> = [];
    const columns = [
      ...s.matchAll(
        new RegExp(String.raw`\bDROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?(${IDENT})`, 'gi'),
      ),
    ]
      .map((match) => unquote(match[1]))
      .filter((name) => !/^(CONSTRAINT|DEFAULT|NOT|INDEX)$/i.test(name));
    for (const column of columns) {
      findings.push({
        rule: 'drop-column',
        severity: 'error',
        message: `DROP COLUMN "${column}" permanently deletes its data`,
      });
    }
    return findings;
  },
  (s) => {
    if (!/^ALTER\s+TABLE\b/i.test(s)) return [];
    return [
      ...s.matchAll(
        new RegExp(
          String.raw`\bALTER\s+(?:COLUMN\s+)?(${IDENT})\s+(?:SET\s+DATA\s+)?TYPE\s+([^,]+?)(?=,\s*(?:ALTER|ADD|DROP)\b|$)`,
          'gi',
        ),
      ),
    ].map((match) => ({
      rule: 'alter-column-type' as const,
      severity: 'error' as const,
      message:
        `column "${unquote(match[1])}" changes type to ${match[2].trim()}` +
        (/\bUSING\b/i.test(match[2])
          ? ' (USING cast — verify it is lossless)'
          : ' — values may be truncated, fail to cast, or the table may be rewritten under lock'),
    }));
  },
  (s, context) => {
    if (!/^ALTER\s+TABLE\b/i.test(s)) return [];
    const table = tableOf(s);
    if (table && context.createdTables.has(table)) return [];
    return [
      ...s.matchAll(
        new RegExp(
          String.raw`\bADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(${IDENT})\s+([^,]*)`,
          'gi',
        ),
      ),
    ]
      .filter(
        (match) => !/^(CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|INDEX)$/i.test(unquote(match[1])),
      )
      .filter(
        (match) =>
          /\bNOT\s+NULL\b/i.test(match[2]) &&
          !/\bDEFAULT\b/i.test(match[2]) &&
          !/\bGENERATED\b/i.test(match[2]),
      )
      .map((match) => ({
        rule: 'add-required-column' as const,
        severity: 'error' as const,
        message: `required column "${unquote(match[1])}" added without a DEFAULT — fails if "${table}" has rows`,
      }));
  },
  (s, context) => {
    if (!/^ALTER\s+TABLE\b/i.test(s) || !/\bSET\s+NOT\s+NULL\b/i.test(s)) return [];
    const table = tableOf(s);
    if (table && (context.createdTables.has(table) || context.backfilledTables.has(table)))
      return [];
    return [
      {
        rule: 'set-not-null',
        severity: 'warning',
        message: 'SET NOT NULL fails if existing rows contain NULL — backfill first',
      },
    ];
  },
  (s, context) => {
    const uniqueIndex = /^CREATE\s+UNIQUE\s+INDEX\b/i.test(s);
    const uniqueConstraint =
      /^ALTER\s+TABLE\b/i.test(s) && /\bADD\s+(?:CONSTRAINT\s+\S+\s+)?UNIQUE\b/i.test(s);
    if (!uniqueIndex && !uniqueConstraint) return [];
    const table = uniqueIndex
      ? unquote(new RegExp(String.raw`\bON\s+(?:ONLY\s+)?(${QUALIFIED})`, 'i').exec(s)?.[1] ?? '')
      : tableOf(s);
    if (table && context.createdTables.has(table)) return [];
    return [
      {
        rule: 'add-unique',
        severity: 'warning',
        message: 'adding a unique constraint fails if duplicate values already exist',
      },
    ];
  },
  (s, context) => {
    if (!/^CREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(s) || /\bCONCURRENTLY\b/i.test(s)) return [];
    const table = unquote(
      new RegExp(String.raw`\bON\s+(?:ONLY\s+)?(${QUALIFIED})`, 'i').exec(s)?.[1] ?? '',
    );
    if (!table || context.createdTables.has(table)) return [];
    return [
      {
        rule: 'blocking-index',
        severity: 'info',
        message: `CREATE INDEX on existing table "${table}" blocks writes while it builds`,
      },
    ];
  },
  (s) =>
    /^ALTER\s+TYPE\b.*\bRENAME\s+TO\b/i.test(s) && /_old"?\s*$/i.test(s)
      ? [
          {
            rule: 'enum-recreate',
            severity: 'warning',
            message:
              'enum is being recreated (values removed) — rows using removed values will fail to migrate',
          },
        ]
      : [],
  (s) =>
    /^ALTER\s+TABLE\b.*\bRENAME\b/i.test(s)
      ? [
          {
            rule: 'rename',
            severity: 'warning',
            message:
              'RENAME breaks application code still using the old name — use expand/contract',
          },
        ]
      : [],
  (s) =>
    /^ALTER\s+TABLE\b.*\bDROP\s+CONSTRAINT\b/i.test(s)
      ? [
          {
            rule: 'drop-constraint',
            severity: 'warning',
            message: 'dropping a constraint removes a data-integrity guarantee',
          },
        ]
      : [],
  (s) =>
    /^DROP\s+INDEX\b/i.test(s)
      ? [
          {
            rule: 'drop-index',
            severity: 'warning',
            message: 'dropping an index can degrade query performance',
          },
        ]
      : [],
];

/** Rules whose presence means the migration must ship with a rollback script. */
const NEEDS_ROLLBACK: Severity[] = ['error', 'warning'];

export function analyzeSql(migration: string, sql: string): Finding[] {
  const context: Context = { createdTables: new Set(), backfilledTables: new Set() };
  const allowed = parseAllowDirectives(sql);
  const findings: Finding[] = [];

  for (const statement of splitStatements(sql)) {
    const created = new RegExp(
      String.raw`^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(${QUALIFIED})`,
      'i',
    ).exec(statement.text);
    if (created) context.createdTables.add(unquote(created[1]));

    for (const rule of RULES) {
      for (const hit of rule(statement.text, context)) {
        findings.push({
          ...hit,
          migration,
          line: statement.line,
          statement:
            statement.text.length > 160 ? `${statement.text.slice(0, 157)}...` : statement.text,
          ...(allowed.has(hit.rule) ? { allowed: true } : {}),
        });
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Migration discovery
// ---------------------------------------------------------------------------

const ROLLBACK_FILES = ['down.sql', 'rollback.sql'];

export function listMigrations(directory: string): string[] {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && fs.existsSync(path.join(directory, entry.name, 'migration.sql')),
    )
    .map((entry) => entry.name)
    .sort();
}

export function validateMigration(
  directory: string,
  migration: string,
  requireRollback: boolean,
): MigrationReport {
  const folder = path.join(directory, migration);
  const sql = fs.readFileSync(path.join(folder, 'migration.sql'), 'utf8');
  const findings = analyzeSql(migration, sql);

  const rollbackName =
    ROLLBACK_FILES.find((name) => fs.existsSync(path.join(folder, name))) ?? null;
  const risky = findings.some(
    (finding) => NEEDS_ROLLBACK.includes(finding.severity) && !finding.allowed,
  );

  if (rollbackName) {
    const rollbackSql = fs.readFileSync(path.join(folder, rollbackName), 'utf8');
    if (splitStatements(rollbackSql).length === 0) {
      findings.push({
        rule: 'empty-rollback',
        severity: risky || requireRollback ? 'error' : 'warning',
        migration,
        line: 1,
        message: `${rollbackName} contains no SQL statements`,
      });
    }
  } else if (risky || requireRollback) {
    findings.push({
      rule: 'missing-rollback',
      severity: 'error',
      migration,
      line: 1,
      message: risky
        ? 'migration contains risky operations but has no down.sql / rollback.sql'
        : 'every migration must include a down.sql / rollback.sql (--require-rollback)',
      ...(parseAllowDirectives(sql).has('missing-rollback') ? { allowed: true } : {}),
    });
  }

  return { migration, rollbackFile: rollbackName, findings };
}

export function validateMigrations(
  directory: string,
  options: { names?: string[]; since?: string; requireRollback?: boolean; strict?: boolean } = {},
): SafetyReport {
  let migrations = listMigrations(directory);
  if (options.since) migrations = migrations.filter((name) => name > options.since!);
  if (options.names && options.names.length > 0) {
    const missing = options.names.filter((name) => !migrations.includes(name));
    if (missing.length > 0) throw new Error(`Migration(s) not found: ${missing.join(', ')}`);
    migrations = options.names;
  }

  const reports = migrations.map((name) =>
    validateMigration(directory, name, options.requireRollback ?? false),
  );
  const active = reports.flatMap((report) => report.findings).filter((finding) => !finding.allowed);

  return {
    generatedAt: new Date().toISOString(),
    directory,
    strict: options.strict ?? false,
    migrations: reports,
    summary: {
      migrations: reports.length,
      errors: active.filter((finding) => finding.severity === 'error').length,
      warnings: active.filter((finding) => finding.severity === 'warning').length,
      info: active.filter((finding) => finding.severity === 'info').length,
      allowed: reports.flatMap((report) => report.findings).filter((finding) => finding.allowed)
        .length,
    },
  };
}

export function isFailing(report: SafetyReport): boolean {
  return report.summary.errors > 0 || (report.strict && report.summary.warnings > 0);
}

export function formatReport(report: SafetyReport): string {
  const icon: Record<Severity, string> = { error: '✗', warning: '!', info: 'i' };
  const lines = ['', 'Prisma Migration Safety Report', '=============================='];

  for (const migration of report.migrations) {
    if (migration.findings.length === 0) {
      lines.push(`✓ ${migration.migration}`);
      continue;
    }
    lines.push(
      `• ${migration.migration}${migration.rollbackFile ? ` (rollback: ${migration.rollbackFile})` : ''}`,
    );
    for (const finding of migration.findings) {
      const suffix = finding.allowed ? ' [allowed]' : '';
      lines.push(
        `    ${icon[finding.severity]} ${finding.severity.toUpperCase()} ${finding.rule} (line ${finding.line})${suffix}: ${finding.message}`,
      );
      if (finding.statement) lines.push(`        ${finding.statement}`);
    }
  }

  const { summary } = report;
  lines.push('');
  lines.push(
    `Migrations: ${summary.migrations}  Errors: ${summary.errors}  Warnings: ${summary.warnings}  ` +
      `Info: ${summary.info}  Allowed: ${summary.allowed}`,
  );
  lines.push(isFailing(report) ? 'Result: UNSAFE' : 'Result: SAFE');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export interface CliOptions {
  dir: string;
  since?: string;
  names: string[];
  requireRollback: boolean;
  strict: boolean;
  json?: string;
}

export function parseArgs(argv: string[], repoRoot: string): CliOptions {
  const options: CliOptions = {
    dir: path.join(repoRoot, 'prisma', 'migrations'),
    names: [],
    requireRollback: false,
    strict: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--'))
        throw new Error(`Missing value for ${flag}`);
      i += 1;
      return value;
    };
    switch (flag) {
      case '--dir':
        options.dir = path.resolve(next());
        break;
      case '--since':
        options.since = next();
        break;
      case '--require-rollback':
        options.requireRollback = true;
        break;
      case '--strict':
        options.strict = true;
        break;
      case '--json':
        options.json = path.resolve(next());
        break;
      default:
        if (flag.startsWith('--')) throw new Error(`Unknown option "${flag}"`);
        options.names.push(flag);
    }
  }
  return options;
}

function main(): void {
  const repoRoot = path.resolve(__dirname, '..', '..');
  try {
    const options = parseArgs(process.argv.slice(2), repoRoot);
    if (!fs.existsSync(options.dir))
      throw new Error(`Migrations directory not found: ${options.dir}`);

    const report = validateMigrations(options.dir, options);
    console.log(formatReport(report));

    if (options.json) {
      fs.mkdirSync(path.dirname(options.json), { recursive: true });
      fs.writeFileSync(options.json, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`Report written to ${options.json}`);
    }
    process.exit(isFailing(report) ? 1 : 0);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}
