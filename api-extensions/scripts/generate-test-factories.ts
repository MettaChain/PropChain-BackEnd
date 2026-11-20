/**
 * Test Data Factory Generator
 *
 * Reads Prisma schema models and generates type-safe factory functions that
 * produce valid test objects matching the schema definitions.
 *
 * Schema discovery:
 *   1. Every `*.prisma` file found under `api-extensions/` (extension-owned models).
 *   2. If none exist, falls back to the main `prisma/schema.prisma` and limits
 *      generation to the models the extension modules work with
 *      (see DEFAULT_EXTENSION_MODELS) — use `--all` or `--models` to change that.
 *
 * For each model the generated file contains:
 *   - an interface with the model's scalar fields (relations are omitted)
 *   - `build<Model>(overrides?)`        → one valid object
 *   - `build<Model>List(count, overrides?)` → several objects
 * plus const objects/types for every enum the selected models use, and
 * `resetFactorySequence()` to make unique values deterministic between tests.
 *
 * Default values honour the schema:
 *   - `@default(...)` literals, enum values, `now()`, `uuid()`, `cuid()`, `autoincrement()`
 *   - `@updatedAt` → current date
 *   - optional fields → `null`, list fields → `[]`
 *   - `@unique` / `@id` fields get sequence-based unique values
 *   - `@db.VarChar(n)` / `@db.Char(n)` lengths are respected
 *   - field-name heuristics for strings (email, *Id, url, phone, hash, ...)
 *
 * The output is self-contained (no dependency on the generated Prisma client),
 * so it can be used in unit tests even when `prisma generate` hasn't run.
 *
 * Usage:
 *   npx ts-node api-extensions/scripts/generate-test-factories.ts [options]
 *
 * Options:
 *   --schema <file>     Prisma schema to read (repeatable; overrides discovery)
 *   --models <list>     Comma-separated model names to generate
 *   --all               Generate factories for every model in the schema(s)
 *   --out <file>        Output file (default: api-extensions/tests/factories/generated.factories.ts)
 *   --check             Don't write; exit 1 if the output file is missing or stale
 *
 * Exit codes:
 *   0  success
 *   1  --check found the output out of date
 *   2  fatal error
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Schema model
// ---------------------------------------------------------------------------

export interface PrismaAttribute {
  name: string;
  /** Raw text between the attribute's parentheses, if any. */
  args?: string;
}

export interface PrismaField {
  name: string;
  type: string;
  isList: boolean;
  isOptional: boolean;
  attributes: PrismaAttribute[];
}

export interface PrismaModel {
  name: string;
  fields: PrismaField[];
  /** Field-name groups from `@@unique([...])` / `@@id([...])`. */
  compoundUniques: string[][];
}

export interface PrismaEnum {
  name: string;
  values: string[];
}

export interface PrismaSchema {
  models: PrismaModel[];
  enums: PrismaEnum[];
}

export const SCALAR_TYPES = [
  'String',
  'Boolean',
  'Int',
  'BigInt',
  'Float',
  'Decimal',
  'DateTime',
  'Json',
  'Bytes',
] as const;

/**
 * Models backing the extension modules in `api-extensions/modules/`
 * (commission-split, amenity-management, ...) and the core records they reference.
 */
export const DEFAULT_EXTENSION_MODELS = [
  'User',
  'Property',
  'Transaction',
  'PropertyAgent',
  'Commission',
  'PropertyAmenity',
  'NeighborhoodAmenity',
];

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Remove `//` comments while leaving `//` inside string literals (e.g. URLs) intact. */
export function stripComment(line: string): string {
  let inString = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i - 1] !== '\\') inString = !inString;
    if (!inString && char === '/' && line[i + 1] === '/') return line.slice(0, i);
  }
  return line;
}

/** Parse `@name` / `@name(args)` attributes, handling nested parentheses and strings. */
export function parseAttributes(text: string): PrismaAttribute[] {
  const attributes: PrismaAttribute[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '@') {
      i += 1;
      continue;
    }
    const nameMatch = /^@([A-Za-z_][\w.]*)/.exec(text.slice(i));
    if (!nameMatch) {
      i += 1;
      continue;
    }
    const name = nameMatch[1];
    i += nameMatch[0].length;

    let args: string | undefined;
    if (text[i] === '(') {
      let depth = 0;
      let inString = false;
      const start = i + 1;
      for (; i < text.length; i += 1) {
        const char = text[i];
        if (char === '"' && text[i - 1] !== '\\') inString = !inString;
        if (inString) continue;
        if (char === '(') depth += 1;
        if (char === ')') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      args = text.slice(start, i).trim();
      i += 1;
    }
    attributes.push(args === undefined ? { name } : { name, args });
  }
  return attributes;
}

const FIELD_PATTERN = /^([A-Za-z_]\w*)\s+(Unsupported\("[^"]*"\)|[A-Za-z_]\w*)(\[\])?(\?)?\s*(.*)$/;

export function parsePrismaSchema(source: string): PrismaSchema {
  const models: PrismaModel[] = [];
  const enums: PrismaEnum[] = [];
  const lines = source.split(/\r?\n/).map((line) => stripComment(line).trim());

  for (let i = 0; i < lines.length; i += 1) {
    const header = /^(model|enum)\s+([A-Za-z_]\w*)\s*\{\s*$/.exec(lines[i]);
    if (!header) continue;
    const [, kind, name] = header;

    const body: string[] = [];
    for (i += 1; i < lines.length && lines[i] !== '}'; i += 1) {
      if (lines[i]) body.push(lines[i]);
    }

    if (kind === 'enum') {
      enums.push({
        name,
        values: body.filter((line) => !line.startsWith('@@')).map((line) => line.split(/\s+/)[0]),
      });
      continue;
    }

    const model: PrismaModel = { name, fields: [], compoundUniques: [] };
    for (const line of body) {
      if (line.startsWith('@@')) {
        const compound = /^@@(unique|id)\s*\(\s*(?:fields:\s*)?\[([^\]]*)\]/.exec(line);
        if (compound) {
          model.compoundUniques.push(
            compound[2]
              .split(',')
              .map((field) => field.trim().replace(/\(.*$/, ''))
              .filter(Boolean),
          );
        }
        continue;
      }
      const match = FIELD_PATTERN.exec(line);
      if (!match) continue;
      const [, fieldName, type, list, optional, rest] = match;
      model.fields.push({
        name: fieldName,
        type,
        isList: Boolean(list),
        isOptional: Boolean(optional),
        attributes: parseAttributes(rest),
      });
    }
    models.push(model);
  }

  return { models, enums };
}

export function mergeSchemas(schemas: PrismaSchema[]): PrismaSchema {
  const models = new Map<string, PrismaModel>();
  const enums = new Map<string, PrismaEnum>();
  for (const schema of schemas) {
    schema.models.forEach((model) => models.set(model.name, model));
    schema.enums.forEach((prismaEnum) => enums.set(prismaEnum.name, prismaEnum));
  }
  return { models: [...models.values()], enums: [...enums.values()] };
}

// ---------------------------------------------------------------------------
// Schema discovery
// ---------------------------------------------------------------------------

function findPrismaFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const found: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...findPrismaFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.prisma')) found.push(fullPath);
  }
  return found.sort();
}

export interface DiscoveredSchemas {
  files: string[];
  /** True when no extension-owned schema exists and the main schema is used instead. */
  usedFallback: boolean;
}

export function discoverSchemaFiles(repoRoot: string): DiscoveredSchemas {
  const extensionFiles = findPrismaFiles(path.join(repoRoot, 'api-extensions'));
  if (extensionFiles.length > 0) return { files: extensionFiles, usedFallback: false };

  const mainSchema = path.join(repoRoot, 'prisma', 'schema.prisma');
  if (!fs.existsSync(mainSchema)) {
    throw new Error('No Prisma schema found under api-extensions/ or prisma/schema.prisma');
  }
  return { files: [mainSchema], usedFallback: true };
}

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

const TS_TYPE: Record<(typeof SCALAR_TYPES)[number], string> = {
  String: 'string',
  Boolean: 'boolean',
  Int: 'number',
  BigInt: 'bigint',
  Float: 'number',
  // Prisma accepts decimal strings for Decimal inputs and they stay lossless.
  Decimal: 'string',
  DateTime: 'Date',
  Json: 'JsonValue',
  Bytes: 'Buffer',
};

function isScalar(type: string): type is (typeof SCALAR_TYPES)[number] {
  return (SCALAR_TYPES as readonly string[]).includes(type);
}

function getAttribute(field: PrismaField, name: string): PrismaAttribute | undefined {
  return field.attributes.find((attribute) => attribute.name === name);
}

/** Fields that end up in the generated object: scalars and enums, not relations. */
export function dataFields(model: PrismaModel, enumNames: Set<string>): PrismaField[] {
  return model.fields.filter(
    (field) =>
      (isScalar(field.type) || enumNames.has(field.type)) && !getAttribute(field, 'ignore'),
  );
}

function maxLength(field: PrismaField): number | undefined {
  const dbType = field.attributes.find((attribute) => /^db\.(VarChar|Char)$/.test(attribute.name));
  const length = dbType?.args ? Number.parseInt(dbType.args, 10) : NaN;
  return Number.isFinite(length) ? length : undefined;
}

function withLength(expression: string, field: PrismaField): string {
  const limit = maxLength(field);
  return limit === undefined ? expression : `${expression}.slice(0, ${limit})`;
}

/** Render a string as a single-quoted TS literal. */
function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

/** Convert a Prisma `@default(...)` argument into a TS expression, or undefined if unsupported. */
function defaultExpression(
  field: PrismaField,
  rawDefault: string,
  enums: Map<string, PrismaEnum>,
): string | undefined {
  const value = rawDefault.trim();

  if (/^(uuid|cuid|nanoid)\(.*\)$/.test(value)) return 'randomUUID()';
  if (value === 'autoincrement()') return 'n';
  if (value === 'now()') return 'new Date()';
  if (/^dbgenerated\(/.test(value) || value === 'auto()') return undefined;

  if (field.isList) {
    const items = /^\[(.*)\]$/.exec(value);
    if (!items) return undefined;
    const elements = items[1]
      .split(',')
      .map((element) => element.trim())
      .filter(Boolean)
      .map((element) => scalarLiteral(field, element, enums))
      .filter((element): element is string => element !== undefined);
    return `[${elements.join(', ')}]`;
  }

  return scalarLiteral(field, value, enums);
}

function scalarLiteral(
  field: PrismaField,
  value: string,
  enums: Map<string, PrismaEnum>,
): string | undefined {
  const prismaEnum = enums.get(field.type);
  if (prismaEnum) {
    return prismaEnum.values.includes(value) ? `${field.type}.${value}` : undefined;
  }

  switch (field.type) {
    case 'String':
      if (!/^".*"$/.test(value)) return undefined;
      try {
        return quote(JSON.parse(value) as string);
      } catch {
        return undefined;
      }
    case 'Boolean':
      return value === 'true' || value === 'false' ? value : undefined;
    case 'Int':
    case 'Float':
      return Number.isFinite(Number(value)) ? value : undefined;
    case 'BigInt':
      return /^-?\d+$/.test(value) ? `BigInt(${value})` : undefined;
    case 'Decimal':
      return Number.isFinite(Number(value)) ? `'${value}'` : undefined;
    case 'Json':
      if (/^".*"$/.test(value)) {
        // Prisma stores Json defaults as a JSON-encoded string literal.
        try {
          const decoded = JSON.parse(JSON.parse(value) as string) as unknown;
          return JSON.stringify(decoded);
        } catch {
          return undefined;
        }
      }
      return undefined;
    default:
      return undefined;
  }
}

/** Generate a valid value for a required field that has no usable `@default`. */
function generatedValue(
  model: PrismaModel,
  field: PrismaField,
  unique: boolean,
  enums: Map<string, PrismaEnum>,
): string {
  const prismaEnum = enums.get(field.type);
  if (prismaEnum) return `${field.type}.${prismaEnum.values[0]}`;

  const name = field.name;
  switch (field.type) {
    case 'String': {
      if (name === 'id' || /Id$/.test(name) || /^uuid$/i.test(name)) {
        return withLength('randomUUID()', field);
      }
      if (/email/i.test(name))
        return withLength(`\`${lowerFirst(model.name)}${'${n}'}@example.com\``, field);
      if (/(url|uri|link|avatar|website)$/i.test(name)) {
        return withLength(`\`https://example.com/${lowerFirst(model.name)}/${'${n}'}\``, field);
      }
      if (/phone/i.test(name))
        return withLength(`\`+1555${"${String(n).padStart(7, '0')}"}\``, field);
      if (/(hash|address)$/i.test(name) && /(blockchain|contract|wallet|tx|hash)/i.test(name)) {
        return withLength(`\`0x${"${n.toString(16).padStart(40, '0')}"}\``, field);
      }
      if (/(token|secret|key)$/i.test(name)) {
        return withLength(`\`${name}-${'${n}'}-${'${randomUUID()}'}\``, field);
      }
      if (/^(zip|postal)/i.test(name)) return withLength(`String(10000 + (n % 89999))`, field);
      if (/^country$/i.test(name)) return `'USA'`;
      if (/^state$/i.test(name)) return `'CA'`;
      if (/^city$/i.test(name)) return `'San Francisco'`;
      if (/password/i.test(name))
        return `'$2b$10$abcdefghijklmnopqrstuuWzN2u7mJ0E5S4u1z7uQ0d3bN8g8bXy6'`;
      return withLength(`\`${name} ${'${n}'}\``, field);
    }
    case 'Boolean':
      return 'false';
    case 'Int':
      return unique ? 'n' : '1';
    case 'Float':
      return unique ? 'n + 0.5' : '1.5';
    case 'BigInt':
      return 'BigInt(n)';
    case 'Decimal':
      if (/rate|percent|ratio/i.test(name)) return `'0.05'`;
      return unique ? '`${n}00.00`' : `'1000.00'`;
    case 'DateTime':
      return 'new Date()';
    case 'Json':
      return '{}';
    case 'Bytes':
      return 'Buffer.alloc(0)';
    default:
      return 'undefined as never';
  }
}

export function fieldValueExpression(
  model: PrismaModel,
  field: PrismaField,
  enums: Map<string, PrismaEnum>,
): string {
  const defaultAttribute = getAttribute(field, 'default');
  if (defaultAttribute?.args !== undefined) {
    const expression = defaultExpression(field, defaultAttribute.args, enums);
    if (expression !== undefined) return expression;
  }
  if (getAttribute(field, 'updatedAt')) return 'new Date()';
  if (field.isOptional) return 'null';
  if (field.isList) return '[]';

  const unique =
    Boolean(getAttribute(field, 'id')) ||
    Boolean(getAttribute(field, 'unique')) ||
    model.compoundUniques.some((group) => group.includes(field.name));
  return generatedValue(model, field, unique, enums);
}

function fieldTsType(field: PrismaField, enumNames: Set<string>): string {
  const base = enumNames.has(field.type)
    ? field.type
    : TS_TYPE[field.type as (typeof SCALAR_TYPES)[number]];
  const listed = field.isList ? `${base}[]` : base;
  return field.isOptional ? `${listed} | null` : listed;
}

export interface GenerateOptions {
  /** Model names to generate; defaults to every model in the schema. */
  models?: string[];
  /** Human-readable list of the source files, written into the header. */
  sources?: string[];
}

export function generateFactoriesSource(
  schema: PrismaSchema,
  options: GenerateOptions = {},
): string {
  const enums = new Map(schema.enums.map((prismaEnum) => [prismaEnum.name, prismaEnum]));
  const enumNames = new Set(enums.keys());

  let selected = schema.models;
  if (options.models && options.models.length > 0) {
    const available = new Map(schema.models.map((model) => [model.name, model]));
    const missing = options.models.filter((name) => !available.has(name));
    if (missing.length > 0) {
      throw new Error(`Unknown model(s): ${missing.join(', ')}`);
    }
    selected = options.models.map((name) => available.get(name) as PrismaModel);
  }

  const usedEnums = new Set<string>();
  for (const model of selected) {
    for (const field of dataFields(model, enumNames)) {
      if (enumNames.has(field.type)) usedEnums.add(field.type);
    }
  }
  const usesJson = selected.some((model) =>
    dataFields(model, enumNames).some((field) => field.type === 'Json'),
  );

  const out: string[] = [];
  out.push('/* eslint-disable */');
  out.push('/**');
  out.push(
    ' * AUTO-GENERATED by api-extensions/scripts/generate-test-factories.ts — do not edit by hand.',
  );
  if (options.sources && options.sources.length > 0) {
    out.push(` * Source schema: ${options.sources.join(', ')}`);
  }
  out.push(' * Regenerate: npx ts-node api-extensions/scripts/generate-test-factories.ts');
  out.push(' */');
  out.push('');
  out.push("import { randomUUID } from 'crypto';");
  out.push('');

  if (usesJson) {
    out.push(
      'export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };',
    );
    out.push('');
  }

  for (const prismaEnum of schema.enums.filter((candidate) => usedEnums.has(candidate.name))) {
    out.push(`export const ${prismaEnum.name} = {`);
    for (const value of prismaEnum.values) out.push(`  ${value}: '${value}',`);
    out.push('} as const;');
    out.push(
      `export type ${prismaEnum.name} = (typeof ${prismaEnum.name})[keyof typeof ${prismaEnum.name}];`,
    );
    out.push('');
  }

  out.push('let sequence = 0;');
  out.push('');
  out.push(
    '/** Reset the counter used for unique values (call in `beforeEach` for deterministic data). */',
  );
  out.push('export function resetFactorySequence(): void {');
  out.push('  sequence = 0;');
  out.push('}');
  out.push('');
  out.push('function nextSequence(): number {');
  out.push('  sequence += 1;');
  out.push('  return sequence;');
  out.push('}');
  out.push('');
  out.push('export type FactoryOverrides<T> = Partial<T> | ((index: number) => Partial<T>);');
  out.push('');

  for (const model of selected) {
    const fields = dataFields(model, enumNames);
    out.push(`/** Scalar fields of the Prisma \`${model.name}\` model. */`);
    out.push(`export interface ${model.name} {`);
    for (const field of fields) out.push(`  ${field.name}: ${fieldTsType(field, enumNames)};`);
    out.push('}');
    out.push('');

    const expressions = fields.map((field) => ({
      field,
      expression: fieldValueExpression(model, field, enums),
    }));
    const usesSequence = expressions.some(({ expression }) => /\bn\b/.test(expression));

    out.push(`/** Build a valid \`${model.name}\` test object. */`);
    out.push(
      `export function build${model.name}(overrides: Partial<${model.name}> = {}): ${model.name} {`,
    );
    out.push(usesSequence ? '  const n = nextSequence();' : '  nextSequence();');
    out.push('  return {');
    for (const { field, expression } of expressions) out.push(`    ${field.name}: ${expression},`);
    out.push('    ...overrides,');
    out.push('  };');
    out.push('}');
    out.push('');
    out.push(`/** Build \`count\` valid \`${model.name}\` test objects. */`);
    out.push(`export function build${model.name}List(`);
    out.push('  count: number,');
    out.push(`  overrides: FactoryOverrides<${model.name}> = {},`);
    out.push(`): ${model.name}[] {`);
    out.push('  return Array.from({ length: count }, (_, index) =>');
    out.push(
      `    build${model.name}(typeof overrides === 'function' ? overrides(index) : overrides),`,
    );
    out.push('  );');
    out.push('}');
    out.push('');
  }

  return `${out.join('\n').trimEnd()}\n`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export interface CliOptions {
  schemaFiles: string[];
  models?: string[];
  all: boolean;
  out: string;
  check: boolean;
}

export function parseArgs(argv: string[], repoRoot: string): CliOptions {
  const options: CliOptions = {
    schemaFiles: [],
    all: false,
    out: path.join(repoRoot, 'api-extensions', 'tests', 'factories', 'generated.factories.ts'),
    check: false,
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
      case '--schema':
        options.schemaFiles.push(path.resolve(next()));
        break;
      case '--models':
        options.models = next()
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean);
        break;
      case '--all':
        options.all = true;
        break;
      case '--out':
        options.out = path.resolve(next());
        break;
      case '--check':
        options.check = true;
        break;
      default:
        throw new Error(`Unknown option "${flag}"`);
    }
  }
  if (options.all && options.models) throw new Error('--all and --models are mutually exclusive');
  return options;
}

/**
 * Format with the repo's Prettier config when Prettier is installed, so the output is stable
 * under the lint-staged hook (which runs Prettier on every committed .ts file).
 */
export async function formatWithPrettier(source: string, filePath: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const prettier = require('prettier') as {
      resolveConfig(file: string): Promise<Record<string, unknown> | null>;
      format(code: string, options: Record<string, unknown>): Promise<string> | string;
    };
    const config = (await prettier.resolveConfig(filePath)) ?? {};
    return await prettier.format(source, { ...config, filepath: filePath });
  } catch {
    return source;
  }
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, '..', '..');
  try {
    const options = parseArgs(process.argv.slice(2), repoRoot);

    let files = options.schemaFiles;
    let usedFallback = false;
    if (files.length === 0) {
      const discovered = discoverSchemaFiles(repoRoot);
      files = discovered.files;
      usedFallback = discovered.usedFallback;
    }

    const schema = mergeSchemas(
      files.map((file) => parsePrismaSchema(fs.readFileSync(file, 'utf8'))),
    );

    let models = options.models;
    if (!models && !options.all && usedFallback) {
      const available = new Set(schema.models.map((model) => model.name));
      models = DEFAULT_EXTENSION_MODELS.filter((name) => available.has(name));
    }

    const sources = files.map((file) => path.relative(repoRoot, file).split(path.sep).join('/'));
    const source = await formatWithPrettier(
      generateFactoriesSource(schema, { models, sources }),
      options.out,
    );
    const generatedModels = models ?? schema.models.map((model) => model.name);

    if (options.check) {
      const current = fs.existsSync(options.out) ? fs.readFileSync(options.out, 'utf8') : '';
      if (current.replace(/\r\n/g, '\n') !== source) {
        console.error(
          `✗ ${path.relative(repoRoot, options.out)} is out of date. Re-run the generator.`,
        );
        process.exit(1);
      }
      console.log(`✓ ${path.relative(repoRoot, options.out)} is up to date.`);
      return;
    }

    fs.mkdirSync(path.dirname(options.out), { recursive: true });
    fs.writeFileSync(options.out, source);
    console.log(
      `Generated ${generatedModels.length} factories (${generatedModels.join(', ')}) from ${sources.join(', ')}`,
    );
    console.log(`→ ${path.relative(repoRoot, options.out)}`);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(2);
  }
}

if (require.main === module) {
  void main();
}
