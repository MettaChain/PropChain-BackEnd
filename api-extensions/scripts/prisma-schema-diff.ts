import * as fs from 'fs';
import * as path from 'path';
import {
  PrismaEnum,
  PrismaField,
  PrismaModel,
  getRepoRoot,
  parsePrismaSchema,
  readSchemaSource,
} from './lib/prisma-schema';

export interface SchemaChange {
  kind: 'added' | 'modified' | 'removed';
  target: 'model' | 'field' | 'relation' | 'enum' | 'enum-value' | 'index';
  path: string;
  detail: string;
  before?: unknown;
  after?: unknown;
}

export interface SchemaDiffOptions {
  from: string;
  to: string;
  jsonPath: string;
  markdownPath: string;
  failOnChange: boolean;
}

const USAGE = `Prisma Schema Diff Reporter

Usage:
  ts-node api-extensions/scripts/prisma-schema-diff.ts [options]

Options:
  --from <file|HEAD>     Baseline schema (default: HEAD)
  --to <file|HEAD>       Comparison schema (default: prisma/schema.prisma)
  --json <path>          JSON report path (default: api-extensions/reports/schema-diff.json)
  --markdown <path>      Markdown report path (default: api-extensions/reports/schema-diff.md)
  --fail-on-change       Exit with status 1 when differences are found
  --help                 Show this message
`;

export function parseDiffOptions(argv: string[]): SchemaDiffOptions {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  const option = (name: string, fallback: string): string => {
    const index = argv.indexOf(name);
    return index >= 0 ? (argv[index + 1] ?? fallback) : fallback;
  };
  return {
    from: option('--from', 'HEAD'),
    to: option('--to', 'prisma/schema.prisma'),
    jsonPath: option('--json', 'api-extensions/reports/schema-diff.json'),
    markdownPath: option('--markdown', 'api-extensions/reports/schema-diff.md'),
    failOnChange: argv.includes('--fail-on-change'),
  };
}

export function diffSchemas(beforeSource: string, afterSource: string): SchemaChange[] {
  const before = parsePrismaSchema(beforeSource);
  const after = parsePrismaSchema(afterSource);
  const changes: SchemaChange[] = [];

  for (const name of before.models.keys()) {
    if (!after.models.has(name)) {
      changes.push({
        kind: 'removed',
        target: 'model',
        path: name,
        detail: `Model ${name} was removed`,
      });
    }
  }
  for (const [name, model] of after.models) {
    const previous = before.models.get(name);
    if (!previous) {
      changes.push({
        kind: 'added',
        target: 'model',
        path: name,
        detail: `Model ${name} was added`,
        after: {
          fields: model.fields.map((field) => field.name),
          indexes: model.indexes.map((index) => index.raw),
        },
      });
      continue;
    }
    changes.push(...diffModel(previous, model));
  }

  for (const name of before.enums.keys()) {
    if (!after.enums.has(name)) {
      changes.push({
        kind: 'removed',
        target: 'enum',
        path: name,
        detail: `Enum ${name} was removed`,
      });
    }
  }
  for (const [name, enumeration] of after.enums) {
    const previous = before.enums.get(name);
    if (!previous) {
      changes.push({
        kind: 'added',
        target: 'enum',
        path: name,
        detail: `Enum ${name} was added with ${enumeration.values.length} values`,
      });
      continue;
    }
    changes.push(...diffEnum(previous, enumeration));
  }

  return changes;
}

function diffModel(before: PrismaModel, after: PrismaModel): SchemaChange[] {
  const changes: SchemaChange[] = [];
  const beforeFields = new Map(before.fields.map((field) => [field.name, field]));
  const afterFields = new Map(after.fields.map((field) => [field.name, field]));

  for (const [name, field] of beforeFields) {
    if (!afterFields.has(name)) {
      changes.push({
        kind: 'removed',
        target: 'field',
        path: `${before.name}.${name}`,
        detail: `Field ${name} was removed (${field.type})`,
      });
    }
  }
  for (const [name, field] of afterFields) {
    const previous = beforeFields.get(name);
    if (!previous) {
      changes.push({
        kind: 'added',
        target: 'field',
        path: `${after.name}.${name}`,
        detail: `Field ${name} was added (${field.type})`,
      });
      continue;
    }
    changes.push(...diffField(before.name, previous, field));
  }

  const beforeIndexes = new Map(before.indexes.map((index) => [index.fields.join(','), index]));
  const afterIndexes = new Map(after.indexes.map((index) => [index.fields.join(','), index]));
  for (const [key, index] of beforeIndexes) {
    if (!afterIndexes.has(key)) {
      changes.push({
        kind: 'removed',
        target: 'index',
        path: `${before.name}.${key}`,
        detail: `${index.kind} index on [${key}] was removed`,
      });
    }
  }
  for (const [key, index] of afterIndexes) {
    const previous = beforeIndexes.get(key);
    if (!previous) {
      changes.push({
        kind: 'added',
        target: 'index',
        path: `${after.name}.${key}`,
        detail: `${index.kind} index on [${key}] was added`,
      });
    } else if (previous.kind !== index.kind) {
      changes.push({
        kind: 'modified',
        target: 'index',
        path: `${after.name}.${key}`,
        detail: `Index kind changed from ${previous.kind} to ${index.kind}`,
        before: previous.kind,
        after: index.kind,
      });
    }
  }

  return changes;
}

function diffField(model: string, before: PrismaField, after: PrismaField): SchemaChange[] {
  const changes: SchemaChange[] = [];
  const pathName = `${model}.${before.name}`;
  if (before.type !== after.type || before.isList !== after.isList) {
    changes.push({
      kind: 'modified',
      target: 'field',
      path: pathName,
      detail: `Type changed from ${before.type}${before.isList ? '[]' : ''} to ${after.type}${after.isList ? '[]' : ''}`,
      before: describeField(before),
      after: describeField(after),
    });
  }
  if (before.isOptional !== after.isOptional) {
    changes.push({
      kind: 'modified',
      target: 'field',
      path: pathName,
      detail: `Nullability changed from ${before.isOptional ? 'optional' : 'required'} to ${after.isOptional ? 'optional' : 'required'}`,
    });
  }
  for (const attribute of ['@default', '@map']) {
    const beforeValue = before.attributes.find((value) => value.startsWith(attribute));
    const afterValue = after.attributes.find((value) => value.startsWith(attribute));
    if (beforeValue !== afterValue) {
      changes.push({
        kind: 'modified',
        target: 'field',
        path: pathName,
        detail: `${attribute} changed from ${beforeValue ?? 'none'} to ${afterValue ?? 'none'}`,
        before: beforeValue,
        after: afterValue,
      });
    }
  }
  if (before.relation !== after.relation) {
    changes.push({
      kind: 'modified',
      target: 'relation',
      path: pathName,
      detail: `Relation changed from ${before.relation ?? 'none'} to ${after.relation ?? 'none'}`,
    });
  }
  return changes;
}

function diffEnum(before: PrismaEnum, after: PrismaEnum): SchemaChange[] {
  const changes: SchemaChange[] = [];
  for (const value of before.values) {
    if (!after.values.includes(value)) {
      changes.push({
        kind: 'removed',
        target: 'enum-value',
        path: `${before.name}.${value}`,
        detail: `Enum value ${value} was removed from ${before.name}`,
      });
    }
  }
  for (const value of after.values) {
    if (!before.values.includes(value)) {
      changes.push({
        kind: 'added',
        target: 'enum-value',
        path: `${after.name}.${value}`,
        detail: `Enum value ${value} was added to ${after.name}`,
      });
    }
  }
  return changes;
}

function describeField(field: PrismaField): string {
  return `${field.type}${field.isList ? '[]' : ''}${field.isOptional ? '?' : ''}`;
}

export function renderMarkdown(changes: SchemaChange[], from: string, to: string): string {
  const lines = [
    '# Prisma Schema Diff',
    '',
    `- Baseline: \`${from}\``,
    `- Comparison: \`${to}\``,
    `- Changes: ${changes.length}`,
    '',
    '| Kind | Target | Path | Detail |',
    '|------|--------|------|--------|',
  ];
  if (changes.length === 0) {
    lines.push('| - | - | - | No schema changes detected |');
  } else {
    for (const change of changes) {
      lines.push(
        `| ${change.kind} | ${change.target} | \`${change.path}\` | ${change.detail.replace(/\|/g, '\\|')} |`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

export function main(argv = process.argv.slice(2)): void {
  const options = parseDiffOptions(argv);
  const repoRoot = getRepoRoot();
  const fromSource = readSchemaSource(options.from, repoRoot);
  const toSource = readSchemaSource(options.to, repoRoot);
  const changes = diffSchemas(fromSource, toSource);
  const markdown = renderMarkdown(changes, options.from, options.to);
  const jsonPath = path.resolve(repoRoot, options.jsonPath);
  const markdownPath = path.resolve(repoRoot, options.markdownPath);

  const report = {
    from: options.from,
    to: options.to,
    generatedAt: new Date().toISOString(),
    summary: {
      models: changes.filter((change) => change.target === 'model').length,
      fields: changes.filter((change) => change.target === 'field').length,
      relations: changes.filter((change) => change.target === 'relation').length,
      enums: changes.filter((change) => change.target === 'enum' || change.target === 'enum-value')
        .length,
      indexes: changes.filter((change) => change.target === 'index').length,
      total: changes.length,
    },
    changes,
  };

  const write = (target: string, contents: string) => {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents, 'utf8');
    process.stdout.write(`Wrote ${target}\n`);
  };
  write(jsonPath, JSON.stringify(report, null, 2));
  write(markdownPath, markdown);
  process.stdout.write(`Schema changes detected: ${changes.length}\n`);
  if (options.failOnChange && changes.length > 0) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Schema diff failed: ${(error as Error).message}\n`);
    process.exitCode = 1;
  }
}
