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
  { pattern: /DROP\s+TABLE/i, description: 'DROP TABLE' },
  { pattern: /DROP\s+COLUMN/i, description: 'DROP COLUMN' },
  { pattern: /DROP\s+INDEX/i, description: 'DROP INDEX' },
  { pattern: /DROP\s+SCHEMA/i, description: 'DROP SCHEMA' },
  { pattern: /TRUNCATE\s+TABLE/i, description: 'TRUNCATE TABLE' },
  { pattern: /ALTER\s+TABLE\s+\S+\s+DROP/i, description: 'ALTER TABLE ... DROP' },
  { pattern: /ALTER\s+TABLE\s+\S+\s+RENAME\s+COLUMN/i, description: 'RENAME COLUMN (breaking)' },
  {
    pattern: /ALTER\s+TABLE\s+\S+\s+ALTER\s+COLUMN\s+\S+\s+SET\s+NOT\s+NULL/i,
    description: 'SET NOT NULL (may fail on existing rows)',
  },
];

interface ViolatingFile {
  file: string;
  violations: string[];
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

function checkFileForDestructiveChanges(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const violations: string[] = [];

  for (const { pattern, description } of DESTRUCTIVE_PATTERNS) {
    const matches = content.match(new RegExp(pattern.source, 'gi'));
    if (matches) {
      violations.push(
        `  - ${description} (${matches.length} occurrence${matches.length > 1 ? 's' : ''})`,
      );
    }
  }

  return violations;
}

function validateMigrations(): void {
  console.log('[validate-migrations] Scanning migration files for destructive changes...\n');

  const sqlFiles = getMigrationSqlFiles();

  if (sqlFiles.length === 0) {
    console.log('[validate-migrations] No migration SQL files found. Nothing to validate.');
    process.exit(0);
  }

  console.log(`[validate-migrations] Found ${sqlFiles.length} migration file(s) to check.\n`);

  const violatingFiles: ViolatingFile[] = [];

  for (const file of sqlFiles) {
    const violations = checkFileForDestructiveChanges(file);
    if (violations.length > 0) {
      const relPath = path.relative(process.cwd(), file);
      violatingFiles.push({ file: relPath, violations });
    }
  }

  if (violatingFiles.length === 0) {
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
      '    3. Add a `-- validate-migrations: allow-destructive` comment to intentionally bypass this check.\n',
  );

  // Check if any violations are explicitly allowed via comment
  let hasUnallowedViolations = false;
  for (const { file } of violatingFiles) {
    const absPath = path.join(process.cwd(), file);
    const content = fs.readFileSync(absPath, 'utf8');
    if (!content.includes('-- validate-migrations: allow-destructive')) {
      hasUnallowedViolations = true;
    } else {
      console.log(
        `[validate-migrations] ⚠️  Bypass comment found in ${file} – skipping block for this file.`,
      );
    }
  }

  process.exit(hasUnallowedViolations ? 1 : 0);
}

validateMigrations();
