import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';
import {
  DEFAULT_EXTENSION_MODELS,
  discoverSchemaFiles,
  fieldValueExpression,
  generateFactoriesSource,
  mergeSchemas,
  parseArgs,
  parseAttributes,
  parsePrismaSchema,
  PrismaSchema,
  stripComment,
} from '../../scripts/generate-test-factories';

const SCHEMA = `
// Leading comment
enum ListingStatus {
  DRAFT
  ACTIVE // trailing comment
  @@map("listing_status")
}

model Listing {
  id          String        @id @default(uuid())
  seq         Int           @default(autoincrement())
  slug        String        @unique @db.VarChar(12)
  title       String
  website     String        @default("https://example.com/a//b")
  ownerEmail  String        @map("owner_email")
  ownerId     String        @map("owner_id")
  status      ListingStatus @default(ACTIVE)
  price       Decimal
  rate        Decimal       @default(0.03)
  tags        String[]      @default(["a", "b"])
  flags       Int[]
  settings    Json          @default("{\\"theme\\":\\"dark\\"}")
  notes       String?
  bedrooms    Int?
  featured    Boolean       @default(false)
  views       BigInt
  score       Float
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  legacy      String        @ignore
  owner       Owner         @relation(fields: [ownerId], references: [id])

  @@unique([ownerId, title])
  @@index([status])
}

model Owner {
  id       String    @id @default(cuid())
  listings Listing[]
}
`;

function loadGenerated(
  schema: PrismaSchema,
  models?: string[],
): Record<string, (...args: unknown[]) => unknown> {
  const source = generateFactoriesSource(schema, { models });
  const { outputText, diagnostics } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
    reportDiagnostics: true,
  });
  expect(diagnostics ?? []).toEqual([]);
  const module = { exports: {} as Record<string, (...args: unknown[]) => unknown> };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('module', 'exports', 'require', outputText)(module, module.exports, require);
  return module.exports;
}

describe('parsing helpers', () => {
  it('strips comments but keeps // inside strings', () => {
    expect(stripComment('a String @default("http://x") // note')).toBe(
      'a String @default("http://x") ',
    );
    expect(stripComment('// whole line')).toBe('');
  });

  it('parses attributes with nested parentheses and strings', () => {
    expect(
      parseAttributes('@id @default(dbgenerated("gen_random_uuid()")) @db.Uuid @map("x)")'),
    ).toEqual([
      { name: 'id' },
      { name: 'default', args: 'dbgenerated("gen_random_uuid()")' },
      { name: 'db.Uuid' },
      { name: 'map', args: '"x)"' },
    ]);
  });
});

describe('parsePrismaSchema', () => {
  const schema = parsePrismaSchema(SCHEMA);

  it('parses enums and models', () => {
    expect(schema.enums).toEqual([{ name: 'ListingStatus', values: ['DRAFT', 'ACTIVE'] }]);
    expect(schema.models.map((model) => model.name)).toEqual(['Listing', 'Owner']);
  });

  it('parses field modifiers and compound uniques', () => {
    const listing = schema.models[0];
    const byName = Object.fromEntries(listing.fields.map((field) => [field.name, field]));
    expect(byName.tags).toEqual(
      expect.objectContaining({ type: 'String', isList: true, isOptional: false }),
    );
    expect(byName.notes).toEqual(expect.objectContaining({ isOptional: true }));
    expect(byName.owner.type).toBe('Owner');
    expect(listing.compoundUniques).toEqual([['ownerId', 'title']]);
  });

  it('merges multiple schemas', () => {
    const merged = mergeSchemas([schema, parsePrismaSchema('model Extra {\n  id String @id\n}')]);
    expect(merged.models.map((model) => model.name)).toEqual(['Listing', 'Owner', 'Extra']);
  });
});

describe('fieldValueExpression', () => {
  const schema = parsePrismaSchema(SCHEMA);
  const enums = new Map(schema.enums.map((prismaEnum) => [prismaEnum.name, prismaEnum]));
  const listing = schema.models[0];
  const expr = (name: string) =>
    fieldValueExpression(
      listing,
      listing.fields.find((field) => field.name === name)!,
      enums,
    );

  it('honours @default values', () => {
    expect(expr('id')).toBe('randomUUID()');
    expect(expr('seq')).toBe('n');
    expect(expr('website')).toBe("'https://example.com/a//b'");
    expect(expr('status')).toBe('ListingStatus.ACTIVE');
    expect(expr('rate')).toBe("'0.03'");
    expect(expr('tags')).toBe("['a', 'b']");
    expect(expr('settings')).toBe('{"theme":"dark"}');
    expect(expr('featured')).toBe('false');
    expect(expr('createdAt')).toBe('new Date()');
    expect(expr('updatedAt')).toBe('new Date()');
  });

  it('uses null for optional fields and [] for lists without defaults', () => {
    expect(expr('notes')).toBe('null');
    expect(expr('bedrooms')).toBe('null');
    expect(expr('flags')).toBe('[]');
  });

  it('generates values for required fields without defaults', () => {
    expect(expr('ownerId')).toBe('randomUUID()');
    expect(expr('ownerEmail')).toContain('@example.com');
    expect(expr('slug')).toMatch(/\.slice\(0, 12\)$/);
    expect(expr('title')).toContain('${n}');
    expect(expr('views')).toBe('BigInt(n)');
  });
});

describe('generateFactoriesSource', () => {
  const schema = parsePrismaSchema(SCHEMA);

  it('emits interfaces without relation or @ignore fields', () => {
    const source = generateFactoriesSource(schema);
    expect(source).toContain('export interface Listing {');
    expect(source).toContain('  notes: string | null;');
    expect(source).toContain('  status: ListingStatus;');
    expect(source).not.toMatch(/^\s+owner: /m);
    expect(source).not.toMatch(/^\s+legacy: /m);
    expect(source).not.toMatch(/^\s+listings: /m);
  });

  it('only emits enums used by the selected models', () => {
    expect(generateFactoriesSource(schema, { models: ['Owner'] })).not.toContain('ListingStatus');
  });

  it('rejects unknown models', () => {
    expect(() => generateFactoriesSource(schema, { models: ['Nope'] })).toThrow(/Unknown model/);
  });

  it('produces runnable factories with valid, unique, overridable values', () => {
    const factories = loadGenerated(schema);
    factories.resetFactorySequence();

    const first = factories.buildListing() as Record<string, unknown>;
    const second = factories.buildListing({ title: 'Custom' }) as Record<string, unknown>;

    expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.id).not.toBe(second.id);
    expect(first.ownerEmail).not.toBe(second.ownerEmail);
    expect((first.slug as string).length).toBeLessThanOrEqual(12);
    expect(first.status).toBe('ACTIVE');
    expect(first.tags).toEqual(['a', 'b']);
    expect(first.settings).toEqual({ theme: 'dark' });
    expect(first.notes).toBeNull();
    expect(first.createdAt).toBeInstanceOf(Date);
    expect(typeof first.views).toBe('bigint');
    expect(second.title).toBe('Custom');

    const list = factories.buildListingList(3, (index: number) => ({
      title: `T${index}`,
    })) as Array<Record<string, unknown>>;
    expect(list.map((item) => item.title)).toEqual(['T0', 'T1', 'T2']);

    factories.resetFactorySequence();
    expect((factories.buildListing() as Record<string, unknown>).seq).toBe(1);
  });
});

describe('against the repository schema', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');

  it('discovers a schema and generates the default extension models', async () => {
    const discovered = discoverSchemaFiles(repoRoot);
    expect(discovered.files.length).toBeGreaterThan(0);

    const schema = mergeSchemas(
      discovered.files.map((file) => parsePrismaSchema(fs.readFileSync(file, 'utf8'))),
    );
    const available = new Set(schema.models.map((model) => model.name));
    const models = DEFAULT_EXTENSION_MODELS.filter((name) => available.has(name));
    const factories = loadGenerated(schema, models);

    for (const name of models) {
      const built = factories[`build${name}`]() as Record<string, unknown>;
      expect(built).toEqual(expect.objectContaining({ id: expect.anything() }));
    }
  });
});

describe('discoverSchemaFiles', () => {
  it('prefers *.prisma files inside api-extensions/', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'factories-'));
    fs.mkdirSync(path.join(root, 'prisma'));
    fs.writeFileSync(path.join(root, 'prisma', 'schema.prisma'), '');
    expect(discoverSchemaFiles(root)).toEqual({
      files: [path.join(root, 'prisma', 'schema.prisma')],
      usedFallback: true,
    });

    fs.mkdirSync(path.join(root, 'api-extensions', 'prisma'), { recursive: true });
    fs.writeFileSync(path.join(root, 'api-extensions', 'prisma', 'ext.prisma'), '');
    expect(discoverSchemaFiles(root)).toEqual({
      files: [path.join(root, 'api-extensions', 'prisma', 'ext.prisma')],
      usedFallback: false,
    });
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('parseArgs', () => {
  it('parses options and rejects conflicting flags', () => {
    const options = parseArgs(['--models', 'User, Commission', '--check'], '/repo');
    expect(options.models).toEqual(['User', 'Commission']);
    expect(options.check).toBe(true);
    expect(() => parseArgs(['--all', '--models', 'User'], '/repo')).toThrow(/mutually exclusive/);
    expect(() => parseArgs(['--nope'], '/repo')).toThrow(/Unknown option/);
  });
});
