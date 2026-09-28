/**
 * Issue #1290 – config documentation smoke test.
 *
 * Config that is documented but silently does nothing creates false
 * operational assumptions. This spec asserts that the connection-pool and
 * cache-warming knobs are both (a) documented and (b) actually implemented,
 * and that the parsing helpers behave as documented.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildDatasourceUrl } from '../../src/database/prisma.service';
import { resolveWarmingIntervalMs } from '../../src/cache/cache-warming.service';

const projectRoot = join(__dirname, '..', '..');

function read(relativePath: string): string {
  return readFileSync(join(projectRoot, relativePath), 'utf8');
}

describe('Config documentation (#1290)', () => {
  const readme = read('README.md');
  const envExample = read('.env.example');

  const documentedKnobs = [
    'PGBOUNCER_POOL_SIZE',
    'PGBOUNCER_POOL_TIMEOUT',
    'CACHE_WARMING_ENABLED',
    'CACHE_WARMING_INTERVAL',
  ];

  it('documents every supported pool/cache knob in README and .env.example', () => {
    for (const knob of documentedKnobs) {
      expect(readme).toContain(knob);
      expect(envExample).toContain(knob);
    }
  });

  it('implements every documented pool/cache knob in source', () => {
    const prismaSource = read('src/database/prisma.service.ts');
    const cacheWarmingSource = read('src/cache/cache-warming.service.ts');

    expect(prismaSource).toContain('PGBOUNCER_POOL_SIZE');
    expect(prismaSource).toContain('PGBOUNCER_POOL_TIMEOUT');
    expect(cacheWarmingSource).toContain('CACHE_WARMING_ENABLED');
    expect(cacheWarmingSource).toContain('CACHE_WARMING_INTERVAL');
  });
});

describe('buildDatasourceUrl (#1290)', () => {
  it('folds the pool size and timeout into the Prisma datasource URL', () => {
    const url = buildDatasourceUrl({
      databaseUrl: 'postgresql://user:pass@localhost:5432/propchain',
      pgbouncerEnabled: false,
      poolSize: 20,
      poolTimeoutMs: 10_000,
    });

    expect(url).toBeDefined();
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get('connection_limit')).toBe('20');
    // Prisma expects pool_timeout in seconds.
    expect(parsed.searchParams.get('pool_timeout')).toBe('10');
  });

  it('rounds sub-second timeouts up to at least one second', () => {
    const url = buildDatasourceUrl({
      databaseUrl: 'postgresql://localhost:5432/propchain',
      pgbouncerEnabled: false,
      poolSize: 5,
      poolTimeoutMs: 250,
    });

    expect(new URL(url as string).searchParams.get('pool_timeout')).toBe('1');
  });

  it('does not override pool parameters already present in the URL', () => {
    const url = buildDatasourceUrl({
      databaseUrl: 'postgresql://localhost:5432/propchain?connection_limit=7&pool_timeout=3',
      pgbouncerEnabled: false,
      poolSize: 20,
      poolTimeoutMs: 10_000,
    });

    const parsed = new URL(url as string);
    expect(parsed.searchParams.get('connection_limit')).toBe('7');
    expect(parsed.searchParams.get('pool_timeout')).toBe('3');
  });

  it('leaves the URL untouched when PgBouncer owns the pool', () => {
    const databaseUrl = 'postgresql://localhost:5432/propchain?pgbouncer=true';
    const url = buildDatasourceUrl({
      databaseUrl,
      pgbouncerEnabled: true,
      poolSize: 20,
      poolTimeoutMs: 10_000,
    });

    expect(url).toBe(databaseUrl);
  });

  it('passes through non-URL connection strings and missing URLs', () => {
    expect(
      buildDatasourceUrl({
        databaseUrl: 'not-a-url',
        pgbouncerEnabled: false,
        poolSize: 20,
        poolTimeoutMs: 10_000,
      }),
    ).toBe('not-a-url');

    expect(
      buildDatasourceUrl({ pgbouncerEnabled: false, poolSize: 20, poolTimeoutMs: 10_000 }),
    ).toBeUndefined();
  });
});

describe('resolveWarmingIntervalMs (#1290)', () => {
  const DEFAULT = 30 * 60 * 1000;

  it('defaults to 30 minutes when unset', () => {
    expect(resolveWarmingIntervalMs(undefined)).toBe(DEFAULT);
  });

  it('uses a positive configured interval', () => {
    expect(resolveWarmingIntervalMs('60000')).toBe(60_000);
  });

  it('falls back to the default for invalid or non-positive values', () => {
    expect(resolveWarmingIntervalMs('not-a-number')).toBe(DEFAULT);
    expect(resolveWarmingIntervalMs('0')).toBe(DEFAULT);
    expect(resolveWarmingIntervalMs('-5')).toBe(DEFAULT);
  });
});
