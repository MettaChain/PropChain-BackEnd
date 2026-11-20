import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { ObjectLiteralExpression, Project, SyntaxKind } from 'ts-morph';
import {
  PrismaModel,
  getRepoRoot,
  indexPrefixes,
  parsePrismaSchema,
  readSchemaSource,
} from './lib/prisma-schema';

export interface FieldUsage {
  model: string;
  field: string;
  count: number;
  examples: string[];
}

export interface IndexRecommendation {
  severity: 'high' | 'medium' | 'low';
  category: 'missing-index' | 'n-plus-one' | 'unused-index';
  model: string;
  detail: string;
  evidence?: unknown;
}

export interface AuditOptions {
  schema: string;
  model?: string;
  dbStats: boolean;
  maxExamples: number;
  jsonPath: string;
  markdownPath: string;
}

const USAGE = `Database Index Audit Script

Usage:
  ts-node api-extensions/scripts/database-index-audit.ts [options]

Options:
  --schema <path|HEAD>  Prisma schema to analyze (default: prisma/schema.prisma)
  --model <name>        Only report on one model (for example Property)
  --db-stats            Query pg_stat_user_indexes for unused index candidates
  --max-examples <n>    Usage examples per field (default: 3)
  --json <path>         JSON report path (default: api-extensions/reports/database-index-audit.json)
  --markdown <path>     Markdown report path (default: api-extensions/reports/database-index-audit.md)
  --help                Show this message
`;

export function parseAuditOptions(argv: string[]): AuditOptions {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  const option = (name: string, fallback?: string): string | undefined => {
    const index = argv.indexOf(name);
    return index >= 0 ? (argv[index + 1] ?? fallback) : fallback;
  };
  const maxExamples = Number(option('--max-examples', '3'));
  if (!Number.isInteger(maxExamples) || maxExamples < 1) {
    throw new Error('--max-examples must be a positive integer');
  }
  return {
    schema: option('--schema', 'prisma/schema.prisma') ?? 'prisma/schema.prisma',
    model: option('--model'),
    dbStats: argv.includes('--db-stats'),
    maxExamples,
    jsonPath:
      option('--json', 'api-extensions/reports/database-index-audit.json') ??
      'api-extensions/reports/database-index-audit.json',
    markdownPath:
      option('--markdown', 'api-extensions/reports/database-index-audit.md') ??
      'api-extensions/reports/database-index-audit.md',
  };
}

export function collectWhereUsage(rootDir: string): {
  usage: Map<string, Map<string, FieldUsage>>;
  nPlusOne: Array<{ model: string; relation: string; source: string; line: number }>;
} {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const sourceFiles = project.addSourceFilesAtPaths([
    path.join(rootDir, 'src', '**', '*.ts'),
    path.join(rootDir, 'api-extensions', '**', '*.ts'),
  ]);
  const usage = new Map<string, Map<string, FieldUsage>>();
  const nPlusOne: Array<{ model: string; relation: string; source: string; line: number }> = [];

  for (const sourceFile of sourceFiles) {
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression().getText();
      const match =
        /\.(\w+)\.(findMany|findFirst|findUnique|count|updateMany|deleteMany|aggregate|groupBy)$/.exec(
          callee,
        );
      if (!match) continue;
      const model = match[1];
      const source = path.relative(rootDir, sourceFile.getFilePath());
      const line = call.getStartLineNumber();
      const args = call.getArguments();
      if (args.length === 0 || !args[0].isKind(SyntaxKind.ObjectLiteralExpression)) continue;
      const options = args[0] as ObjectLiteralExpression;
      const where = propertyObject(options, 'where');
      if (where) {
        const modelUsage = usage.get(model) ?? new Map<string, FieldUsage>();
        for (const property of objectPropertyNames(where)) {
          if (['AND', 'OR', 'NOT'].includes(property)) continue;
          const fieldUsage = modelUsage.get(property) ?? {
            model,
            field: property,
            count: 0,
            examples: [],
          };
          fieldUsage.count += 1;
          fieldUsage.examples.push(`${source}:${line}`);
          modelUsage.set(property, fieldUsage);
        }
        usage.set(model, modelUsage);
      }

      const include = propertyObject(options, 'include');
      if (include && isInsideLoop(call)) {
        for (const relation of objectPropertyNames(include)) {
          nPlusOne.push({ model, relation, source, line });
        }
      }
    }
  }
  return { usage, nPlusOne };
}

function propertyObject(
  object: ObjectLiteralExpression,
  name: string,
): ObjectLiteralExpression | undefined {
  const property = object.getProperty(name);
  if (property && property.isKind(SyntaxKind.PropertyAssignment)) {
    const initializer = property.getInitializer();
    if (initializer?.isKind(SyntaxKind.ObjectLiteralExpression)) return initializer;
  }
  return undefined;
}

function objectPropertyNames(object: ObjectLiteralExpression): string[] {
  return object
    .getProperties()
    .map((property) =>
      property
        .getText()
        .split(':')[0]
        .trim()
        .replace(/[?'"`]/g, ''),
    )
    .filter((name) => /^\w+$/.test(name));
}

function isInsideLoop(node: {
  getAncestors(): Array<{ getKind(): SyntaxKind; getText(): string }>;
}): boolean {
  return node
    .getAncestors()
    .some(
      (ancestor) =>
        [SyntaxKind.ForStatement, SyntaxKind.ForOfStatement, SyntaxKind.ForInStatement].includes(
          ancestor.getKind(),
        ) ||
        (ancestor.getKind() === SyntaxKind.CallExpression &&
          /\.(forEach|map)\s*\(/.test(ancestor.getText().slice(0, 120))),
    );
}

export function buildRecommendations(
  models: Map<string, PrismaModel>,
  usage: Map<string, Map<string, FieldUsage>>,
  nPlusOne: Array<{ model: string; relation: string; source: string; line: number }>,
  unusedIndexes: Array<{ table: string; index: string; scans: number }> = [],
  modelFilter?: string,
): IndexRecommendation[] {
  const recommendations: IndexRecommendation[] = [];

  for (const [modelName, fields] of usage) {
    const model = resolveModel(models, modelName);
    if (!model || (modelFilter && model.name !== modelFilter)) continue;
    const indexed = indexPrefixes(model);
    for (const fieldUsage of fields.values()) {
      if (indexed.has(fieldUsage.field)) continue;
      recommendations.push({
        severity: fieldUsage.count >= 10 ? 'high' : fieldUsage.count >= 3 ? 'medium' : 'low',
        category: 'missing-index',
        model: model.name,
        detail: `${modelName}.${fieldUsage.field} appears in ${fieldUsage.count} where clauses without a leading index`,
        evidence: fieldUsage.examples,
      });
    }
  }

  for (const occurrence of nPlusOne) {
    const model = resolveModel(models, occurrence.model);
    if (!model || (modelFilter && model.name !== modelFilter)) continue;
    const relation = model.fields.find((field) => field.name === occurrence.relation);
    if (!relation || !relation.isList) continue;
    recommendations.push({
      severity: 'medium',
      category: 'n-plus-one',
      model: occurrence.model,
      detail: `${occurrence.model}.${occurrence.relation} is included inside a loop and may issue one query per item`,
      evidence: `${occurrence.source}:${occurrence.line}`,
    });
  }

  for (const index of unusedIndexes) {
    const model = Array.from(models.values()).find(
      (candidate) => candidate.mapName === index.table,
    );
    if (!model || (modelFilter && model.name !== modelFilter)) continue;
    if (index.scans > 0) continue;
    recommendations.push({
      severity: 'low',
      category: 'unused-index',
      model: model.name,
      detail: `Index ${index.index} on ${index.table} has never been scanned since statistics were collected`,
      evidence: index,
    });
  }

  return recommendations.sort(
    (left, right) =>
      left.model.localeCompare(right.model) || left.category.localeCompare(right.category),
  );
}

function resolveModel(models: Map<string, PrismaModel>, name: string): PrismaModel | undefined {
  return (
    models.get(name) ??
    Array.from(models.values()).find(
      (model) =>
        model.name.toLowerCase() === name.toLowerCase() ||
        model.mapName?.toLowerCase() === name.toLowerCase(),
    )
  );
}

export function renderMarkdown(recommendations: IndexRecommendation[], model?: string): string {
  const lines = [
    '# Database Index Audit',
    '',
    model ? `Model filter: \`${model}\`` : 'All models',
    `Recommendations: ${recommendations.length}`,
    '',
    '| Severity | Category | Model | Detail |',
    '|----------|----------|-------|--------|',
  ];
  if (recommendations.length === 0) lines.push('| - | - | - | No recommendations |');
  for (const recommendation of recommendations) {
    lines.push(
      `| ${recommendation.severity} | ${recommendation.category} | ${recommendation.model} | ` +
        `${recommendation.detail.replace(/\|/g, '\\|')} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

async function unusedIndexStats(): Promise<Array<{ table: string; index: string; scans: number }>> {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw<
      Array<{ tablename: string; indexname: string; idx_scan: bigint | number | string }>
    >`
      SELECT relname AS tablename, indexrelname AS indexname, idx_scan
      FROM pg_stat_user_indexes
      WHERE schemaname = current_schema()
      ORDER BY idx_scan ASC
      LIMIT 500
    `;
    return rows.map((row) => ({
      table: row.tablename,
      index: row.indexname,
      scans: Number(row.idx_scan),
    }));
  } finally {
    await prisma.$disconnect();
  }
}

function write(target: string, contents: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, 'utf8');
  process.stdout.write(`Wrote ${target}\n`);
}

export async function main(argv = process.argv.slice(2)): Promise<IndexRecommendation[]> {
  const options = parseAuditOptions(argv);
  const repoRoot = getRepoRoot();
  const schema = parsePrismaSchema(readSchemaSource(options.schema, repoRoot));
  const { usage, nPlusOne } = collectWhereUsage(repoRoot);
  const unusedIndexes = options.dbStats ? await unusedIndexStats() : [];
  const recommendations = buildRecommendations(
    schema.models,
    usage,
    nPlusOne,
    unusedIndexes,
    options.model,
  );

  const report = {
    schema: options.schema,
    modelFilter: options.model ?? null,
    databaseStatisticsEnabled: options.dbStats,
    generatedAt: new Date().toISOString(),
    summary: {
      missingIndexes: recommendations.filter((item) => item.category === 'missing-index').length,
      nPlusOne: recommendations.filter((item) => item.category === 'n-plus-one').length,
      unusedIndexes: recommendations.filter((item) => item.category === 'unused-index').length,
    },
    recommendations,
  };

  write(path.resolve(repoRoot, options.jsonPath), JSON.stringify(report, null, 2));
  write(
    path.resolve(repoRoot, options.markdownPath),
    renderMarkdown(recommendations, options.model),
  );
  process.stdout.write(`Index recommendations: ${recommendations.length}\n`);
  return recommendations;
}

if (require.main === module) {
  main().catch((error: Error) => {
    process.stderr.write(`Index audit failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
