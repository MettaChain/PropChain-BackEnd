/**
 * validate-migrations.ts
 *
 * CI helper that detects destructive changes in pending Prisma migrations.
 * Issue #923 – Prisma migration validation: prevent destructive changes in production.
 *
 * Usage:
 *   npx ts-node scripts/validate-migrations.ts
 *
 * Exit codes:
 *   0 – no destructive changes detected
 *   1 – destructive changes found (fails the CI build)
 */

import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations');

const DESTRUCTIVE_PATTERNS: { pattern: RegExp; description: string }[] = [
  { pattern: /DROP\s+TABLE\b/i, description: 'DROP TABLE' },
  { pattern: /DROP\s+COLUMN\b/i, description: 'DROP COLUMN' },
  { pattern: /DROP\s+INDEX\b/i, description: 'DROP INDEX' },
  { pattern: /DROP\s+SCHEMA\b/i, description: 'DROP SCHEMA' },
  { pattern: /DROP\s+DATABASE\b/i, description: 'DROP DATABASE' },
  { pattern: /DROP\s+TYPE\b/i, description: 'DROP TYPE' },
  { pattern: /TRUNCATE\s+(?:TABLE\s+)?/i, description: 'TRUNCATE' },
  { pattern: /\bREINDEX\b/i, description: 'REINDEX' },
  { pattern: /ALTER\s+TABLE\s+\S+\s+DROP/i, description: 'ALTER TABLE ... DROP' },
  { pattern: /ALTER\s+TABLE\s+\S+\s+RENAME\s+COLUMN/i, description: 'RENAME COLUMN (breaking)' },
  {
    pattern: /ALTER\s+TYPE\b[^;]*?\b(?:ADD|DROP|RENAME)\s+VALUE\b/i,
    description: 'ALTER TYPE ... VALUE',
  },
  {
    pattern: /ALTER\s+TABLE\s+\S+\s+ALTER\s+COLUMN\s+\S+\s+SET\s+NOT\s+NULL/i,
    description: 'SET NOT NULL (may fail on existing rows)',
  },
];

interface ViolatingFile {
  file: string;
  violations: string[];
}

interface SqlScan {
  sql: string;
  lineComments: string[];
}

interface MigrationFile {
  file: string;
  content: string;
}

function maskSqlCommentsAndStrings(content: string): SqlScan {
  const output = content.split('');
  const lineComments: string[] = [];
  let index = 0;

  const mask = (start: number, end: number): void => {
    for (let cursor = start; cursor < end; cursor += 1) {
      if (output[cursor] !== '\n' && output[cursor] !== '\r') {
        output[cursor] = ' ';
      }
    }
  };

  while (index < content.length) {
    if (content.startsWith('--', index)) {
      const start = index;
      const newline = content.indexOf('\n', index);
      const end = newline === -1 ? content.length : newline;
      lineComments.push(content.slice(index + 2, end).trim());
      mask(start, end);
      index = end;
      continue;
    }

    if (content.startsWith('/*', index)) {
      const start = index;
      let depth = 1;
      index += 2;
      while (index < content.length && depth > 0) {
        if (content.startsWith('/*', index)) {
          depth += 1;
          index += 2;
        } else if (content.startsWith('*/', index)) {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }
      mask(start, index);
      continue;
    }

    if (content[index] === "'") {
      const start = index;
      index += 1;
      while (index < content.length) {
        if (content[index] === "'" && content[index + 1] === "'") {
          index += 2;
        } else if (content[index] === "'") {
          index += 1;
          break;
        } else if (content[index] === '\\') {
          index += 2;
        } else {
          index += 1;
        }
      }
      mask(start, index);
      continue;
    }

    if (content[index] === '"') {
      index += 1;
      while (index < content.length) {
        if (content[index] === '"' && content[index + 1] === '"') {
          index += 2;
        } else if (content[index] === '"') {
          index += 1;
          break;
        } else {
          index += 1;
        }
      }
      continue;
    }

    const dollarQuote = content.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
    if (dollarQuote) {
      const start = index;
      const closingIndex = content.indexOf(dollarQuote, index + dollarQuote.length);
      index = closingIndex === -1 ? content.length : closingIndex + dollarQuote.length;
      mask(start, index);
      continue;
    }

    index += 1;
  }

  return { sql: output.join(''), lineComments };
}

function hasTopLevelKeyword(statement: string, keyword: string, startAt = 0): boolean {
  let depth = 0;
  let baseDepth = 0;
  let index = 0;

  while (index < statement.length) {
    if (statement[index] === '"') {
      index += 1;
      while (index < statement.length) {
        if (statement[index] === '"' && statement[index + 1] === '"') {
          index += 2;
        } else if (statement[index] === '"') {
          index += 1;
          break;
        } else {
          index += 1;
        }
      }
      continue;
    }

    if (statement[index] === '(') depth += 1;
    if (statement[index] === ')') depth -= 1;
    if (index === startAt) baseDepth = depth;

    if (index >= startAt && depth === baseDepth) {
      const match = statement.slice(index).match(new RegExp(`^${keyword}\\b`, 'i'));
      const previous = statement[index - 1] ?? ' ';
      if (match && !/[A-Za-z0-9_$]/.test(previous)) return true;
    }
    index += 1;
  }

  return false;
}

export function checkSqlForDestructiveChanges(content: string): string[] {
  const { sql } = maskSqlCommentsAndStrings(content);
  const violations: string[] = [];

  for (const { pattern, description } of DESTRUCTIVE_PATTERNS) {
    const matches = sql.match(new RegExp(pattern.source, 'gi'));
    if (matches) {
      violations.push(
        `  - ${description} (${matches.length} occurrence${matches.length > 1 ? 's' : ''})`,
      );
    }
  }

  for (const statement of sql.split(';')) {
    const dmlPattern = /\b(DELETE\s+FROM|UPDATE)\b/gi;
    let match: RegExpExecArray | null;
    while ((match = dmlPattern.exec(statement)) !== null) {
      const operation = match[1].toUpperCase();
      const hasWhere = hasTopLevelKeyword(statement, 'WHERE', match.index);
      if (operation === 'DELETE FROM' && !hasWhere) {
        violations.push('  - DELETE FROM without WHERE');
      } else if (
        operation === 'UPDATE' &&
        /\bSET\b/i.test(statement.slice(match.index + match[0].length)) &&
        !hasWhere
      ) {
        violations.push('  - UPDATE without WHERE');
      }
    }
  }

  return violations;
}

export function findDuplicateTableCreations(migrations: MigrationFile[]): string[] {
  const tableCreations = new Map<string, string[]>();
  const createTablePattern =
    /\bCREATE\s+(?:(?:UNLOGGED|TEMP(?:ORARY)?)\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"(?:[^"]|"")*"|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"(?:[^"]|"")*"|[A-Za-z_][\w$]*))?)/gi;

  for (const migration of migrations) {
    const { sql } = maskSqlCommentsAndStrings(migration.content);
    let match: RegExpExecArray | null;
    while ((match = createTablePattern.exec(sql)) !== null) {
      const table = match[1].replace(/"/g, '').replace(/\s/g, '').toLowerCase();
      const files = tableCreations.get(table) ?? [];
      files.push(migration.file);
      tableCreations.set(table, files);
    }
  }

  return Array.from(tableCreations.entries())
    .filter(([, files]) => files.length > 1)
    .map(
      ([table, files]) =>
        `  - Table "${table}" is created in multiple migrations: ${files.join(', ')}`,
    );
}

export function hasReviewedDestructiveApproval(content: string): boolean {
  const { lineComments } = maskSqlCommentsAndStrings(content);
  return lineComments.some((comment) =>
    /^validate-migrations:\s*allow-destructive\s+approved-by:\s*\S+\s+reason:\s*\S.+$/i.test(
      comment,
    ),
  );
}

function getMigrationSqlFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log(`[validate-migrations] Migrations directory not found: ${MIGRATIONS_DIR}`);
    return [];
  }

  const files: string[] = [];
  const entries = fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const sqlFile = path.join(MIGRATIONS_DIR, entry.name, 'migration.sql');
      if (fs.existsSync(sqlFile)) {
        files.push(sqlFile);
      }
    } else if (entry.isFile() && entry.name.endsWith('.sql')) {
      files.push(path.join(MIGRATIONS_DIR, entry.name));
    }
  }

  return files;
}

export function validateMigrations(): void {
  console.log('[validate-migrations] Scanning migration files for destructive changes...\n');

  const sqlFiles = getMigrationSqlFiles();

  if (sqlFiles.length === 0) {
    console.log('[validate-migrations] No migration SQL files found. Nothing to validate.');
    process.exit(0);
  }

  console.log(`[validate-migrations] Found ${sqlFiles.length} migration file(s) to check.\n`);

  const violatingFiles: ViolatingFile[] = [];
  const migrationContents: MigrationFile[] = [];

  for (const file of sqlFiles) {
    const content = fs.readFileSync(file, 'utf8');
    migrationContents.push({ file: path.relative(process.cwd(), file), content });
    const violations = checkSqlForDestructiveChanges(content);
    if (violations.length > 0) {
      const relPath = path.relative(process.cwd(), file);
      violatingFiles.push({ file: relPath, violations });
    }
  }

  const duplicateTableViolations = findDuplicateTableCreations(migrationContents);
  if (duplicateTableViolations.length > 0) {
    console.error('[validate-migrations] Duplicate table creations detected:\n');
    duplicateTableViolations.forEach((violation) => console.error(violation));
  }

  if (violatingFiles.length === 0 && duplicateTableViolations.length === 0) {
    console.log(
      '[validate-migrations] ✅  No destructive changes detected. All migrations are safe.',
    );
    process.exit(0);
  }

  // Destructive changes found – warn and exit non-zero
  console.error('[validate-migrations] ⚠️  Destructive migration changes detected:\n');
  for (const { file, violations } of violatingFiles) {
    console.error(`  📄 ${file}`);
    for (const v of violations) {
      console.error(v);
    }
    console.error('');
  }

  console.error(
    '[validate-migrations] ACTION REQUIRED:\n' +
      '  Destructive schema changes can cause data loss and irreversible damage in production.\n' +
      '  Please review the migrations above and either:\n' +
      '    1. Provide a rollback script alongside the migration (rollback.sql in the same folder).\n' +
      '    2. Use a safe migration strategy (e.g., rename-then-drop in separate releases).\n' +
      '    3. Add `-- validate-migrations: allow-destructive approved-by: <approver> reason: <review context>` to intentionally bypass this check.\n',
  );

  // Check if any violations are explicitly allowed via comment
  let hasUnallowedViolations = false;
  for (const { file } of violatingFiles) {
    const absPath = path.join(process.cwd(), file);
    const content = fs.readFileSync(absPath, 'utf8');
    if (!hasReviewedDestructiveApproval(content)) {
      hasUnallowedViolations = true;
    } else {
      console.log(
        `[validate-migrations] Reviewed bypass found in ${file} – skipping destructive findings for this file.`,
      );
    }
  }

  process.exitCode = hasUnallowedViolations || duplicateTableViolations.length > 0 ? 1 : 0;
}

if (require.main === module) {
  validateMigrations();
}
