/**
 * Redis Cache Warmer for Extension Module Endpoints
 *
 * Pre-populates Redis with responses for the most common extension-module
 * queries so the first real requests after a deploy/restart are served from
 * cache instead of hitting cold code paths.
 *
 * How it works:
 *   1. Executes a list of common GET queries (DEFAULT_WARM_TARGETS, or a JSON
 *      file passed with --targets) against the running API.
 *   2. Stores each successful JSON response in Redis under a deterministic key
 *      (`<key-prefix>GET:<path>?<sorted query>`) with a TTL.
 *   3. Optionally expands "seed" targets: IDs extracted from a list response
 *      (e.g. every propertyId returned by /amenities) are substituted into
 *      detail routes such as /amenities/properties/:propertyId, so per-entity
 *      endpoints get warmed too.
 *   4. Prints a summary and exits non-zero if any target failed.
 *
 * Usage:
 *   npx ts-node api-extensions/scripts/warm-cache.ts [options]
 *
 * Options:
 *   --base-url <url>      API origin (default: $API_BASE_URL or http://localhost:3000)
 *   --prefix <path>       Route prefix prepended to every target path (default: $API_PREFIX or "")
 *   --redis-url <url>     Redis connection URL (default: $REDIS_URL, else built from
 *                         $REDIS_HOST / $REDIS_PORT / $REDIS_PASSWORD / $REDIS_DB)
 *   --key-prefix <str>    Redis key prefix (default: $CACHE_WARM_KEY_PREFIX or "ext-cache:")
 *   --ttl <seconds>       Default TTL for cached entries (default: 300)
 *   --targets <file>      JSON file with an array of WarmTarget objects (replaces defaults)
 *   --only <regex>        Only warm targets whose name or path matches
 *   --concurrency <n>     Parallel requests (default: 4)
 *   --max-expansions <n>  Max IDs expanded per seed target (default: 20)
 *   --token <jwt>         Bearer token sent with every request (default: $API_TOKEN)
 *   --timeout <ms>        Per-request timeout (default: 10000)
 *   --dry-run             Execute the queries but don't write to Redis
 *   --flush               Delete existing keys under the key prefix before warming
 *
 * Exit codes:
 *   0  all targets warmed
 *   1  one or more targets failed
 *   2  fatal error (bad arguments, Redis unreachable, ...)
 */

import * as fs from 'fs';
import * as path from 'path';
import Redis from 'ioredis';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WarmTarget {
  /** Human-readable label used in logs. */
  name: string;
  /** Route path, may contain `:param` placeholders filled from `expandFrom`. */
  path: string;
  /** Query-string parameters. */
  query?: Record<string, string | number | boolean>;
  /** TTL override in seconds. */
  ttlSeconds?: number;
  /**
   * Expand this target once per ID found in another target's response.
   * `source` is the name of the target to read IDs from, `field` the property holding the ID,
   * `param` the placeholder in `path` to substitute.
   */
  expandFrom?: { source: string; field: string; param: string };
}

export interface WarmResult {
  name: string;
  key: string;
  url: string;
  status: number | null;
  bytes: number;
  durationMs: number;
  cached: boolean;
  error?: string;
}

export interface WarmOptions {
  baseUrl: string;
  prefix: string;
  redisUrl: string;
  keyPrefix: string;
  ttlSeconds: number;
  targets: WarmTarget[];
  only?: RegExp;
  concurrency: number;
  maxExpansions: number;
  token?: string;
  timeoutMs: number;
  dryRun: boolean;
  flush: boolean;
}

/** Minimal Redis surface used by the warmer (lets callers inject a fake). */
export interface CacheStore {
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  scanKeys(pattern: string): Promise<string[]>;
  del(keys: string[]): Promise<number>;
  quit(): Promise<unknown>;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

// ---------------------------------------------------------------------------
// Default targets — the common queries of the extension modules
// ---------------------------------------------------------------------------

export const DEFAULT_WARM_TARGETS: WarmTarget[] = [
  // amenity-management
  { name: 'amenities:list', path: '/amenities' },
  { name: 'amenities:grouped', path: '/amenities/grouped', ttlSeconds: 600 },
  {
    name: 'amenities:autocomplete',
    path: '/amenities/autocomplete',
    query: { q: '' },
    ttlSeconds: 600,
  },
  {
    name: 'amenities:by-property',
    path: '/amenities/properties/:propertyId',
    expandFrom: { source: 'amenities:list', field: 'propertyId', param: 'propertyId' },
  },
  // maintenance-tracking
  { name: 'maintenance:list', path: '/maintenance-requests' },
  {
    name: 'maintenance:property-summary',
    path: '/maintenance-requests/property/:propertyId/summary',
    expandFrom: { source: 'maintenance:list', field: 'propertyId', param: 'propertyId' },
  },
  {
    name: 'maintenance:property-history',
    path: '/maintenance-requests/property/:propertyId/history',
    expandFrom: { source: 'maintenance:list', field: 'propertyId', param: 'propertyId' },
  },
  // tenant-screening
  { name: 'tenant-screenings:list', path: '/tenant-screenings' },
  // commission-split
  { name: 'commission-splits:list', path: '/commission-splits' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a deterministic cache key: query params are sorted so equivalent requests share a key. */
export function buildCacheKey(
  keyPrefix: string,
  routePath: string,
  query: WarmTarget['query'] = {},
): string {
  const params = new URLSearchParams();
  for (const name of Object.keys(query).sort()) params.set(name, String(query[name]));
  const qs = params.toString();
  return `${keyPrefix}GET:${routePath}${qs ? `?${qs}` : ''}`;
}

export function buildUrl(
  baseUrl: string,
  prefix: string,
  routePath: string,
  query: WarmTarget['query'] = {},
): string {
  const base = baseUrl.replace(/\/+$/, '');
  const cleanPrefix = prefix ? `/${prefix.replace(/^\/+|\/+$/g, '')}` : '';
  const params = new URLSearchParams();
  for (const name of Object.keys(query).sort()) params.set(name, String(query[name]));
  const qs = params.toString();
  return `${base}${cleanPrefix}${routePath}${qs ? `?${qs}` : ''}`;
}

/** Unwrap the `{ success, data }` envelope added by ResponseFormatInterceptor. */
export function unwrapPayload(body: unknown): unknown {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    if (typeof record.success === 'boolean' && 'data' in record) return record.data;
  }
  return body;
}

/** Collect unique, non-empty values of `field` from an array (or `{ items: [] }`) payload. */
export function extractIds(body: unknown, field: string, limit: number): string[] {
  const payload = unwrapPayload(body);
  let items: unknown[] = [];
  if (Array.isArray(payload)) items = payload;
  else if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const nested = record.items ?? record.results ?? record.data;
    if (Array.isArray(nested)) items = nested;
  }

  const ids = new Set<string>();
  for (const item of items) {
    if (ids.size >= limit) break;
    if (item && typeof item === 'object') {
      const value = (item as Record<string, unknown>)[field];
      if (typeof value === 'string' || typeof value === 'number') {
        if (String(value).length > 0) ids.add(String(value));
      }
    }
  }
  return [...ids];
}

export function resolveRedisUrl(env: NodeJS.ProcessEnv): string {
  if (env.REDIS_URL) return env.REDIS_URL;
  const host = env.REDIS_HOST ?? 'localhost';
  const port = env.REDIS_PORT ?? '6379';
  const db = env.REDIS_DB ?? '0';
  const auth = env.REDIS_PASSWORD ? `:${encodeURIComponent(env.REDIS_PASSWORD)}@` : '';
  return `redis://${auth}${host}:${port}/${db}`;
}

/** Run async tasks with a concurrency cap, preserving result order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

export function createRedisStore(redisUrl: string): CacheStore {
  const client = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });
  let connected: Promise<void> | undefined;
  const ready = (): Promise<void> => (connected ??= client.connect());

  return {
    async set(key, value, mode, seconds) {
      await ready();
      return client.set(key, value, mode, seconds);
    },
    async scanKeys(pattern) {
      await ready();
      const keys: string[] = [];
      let cursor = '0';
      do {
        const [next, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
        cursor = next;
        keys.push(...batch);
      } while (cursor !== '0');
      return keys;
    },
    async del(keys) {
      if (keys.length === 0) return 0;
      await ready();
      return client.del(...keys);
    },
    async quit() {
      return connected ? client.quit() : undefined;
    },
  };
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

interface ConcreteRequest {
  name: string;
  routePath: string;
  query: WarmTarget['query'];
  ttlSeconds: number;
}

async function executeAndStore(
  request: ConcreteRequest,
  options: WarmOptions,
  store: CacheStore | undefined,
  fetchImpl: FetchLike,
): Promise<{ result: WarmResult; body?: unknown }> {
  const url = buildUrl(options.baseUrl, options.prefix, request.routePath, request.query);
  const key = buildCacheKey(options.keyPrefix, request.routePath, request.query);
  const headers: Record<string, string> = { accept: 'application/json', 'x-cache-warm': '1' };
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const base = { name: request.name, key, url };

  try {
    const response = await fetchImpl(url, { method: 'GET', headers, signal: controller.signal });
    const text = await response.text();
    const durationMs = Date.now() - started;

    if (!response.ok) {
      return {
        result: {
          ...base,
          status: response.status,
          bytes: text.length,
          durationMs,
          cached: false,
          error: `HTTP ${response.status}`,
        },
      };
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return {
        result: {
          ...base,
          status: response.status,
          bytes: text.length,
          durationMs,
          cached: false,
          error: 'response is not JSON',
        },
      };
    }

    if (store && !options.dryRun) {
      await store.set(key, text, 'EX', request.ttlSeconds);
    }
    return {
      result: {
        ...base,
        status: response.status,
        bytes: text.length,
        durationMs,
        cached: !options.dryRun,
      },
      body,
    };
  } catch (error) {
    return {
      result: {
        ...base,
        status: null,
        bytes: 0,
        durationMs: Date.now() - started,
        cached: false,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function warmCache(
  options: WarmOptions,
  store: CacheStore | undefined,
  fetchImpl: FetchLike = fetch,
  log: (line: string) => void = console.log,
): Promise<WarmResult[]> {
  const selected = options.targets.filter(
    (target) => !options.only || options.only.test(target.name) || options.only.test(target.path),
  );
  const byName = new Map(options.targets.map((target) => [target.name, target]));

  // Seed targets that expanded targets depend on must run even if filtered out by --only.
  const seedNames = new Set(
    selected.filter((target) => target.expandFrom).map((target) => target.expandFrom!.source),
  );
  for (const name of seedNames) {
    if (!byName.has(name)) throw new Error(`Target references unknown expandFrom source "${name}"`);
  }

  const direct = options.targets.filter(
    (target) => !target.expandFrom && (selected.includes(target) || seedNames.has(target.name)),
  );
  const expanded = selected.filter((target) => target.expandFrom);

  if (options.flush && store && !options.dryRun) {
    const keys = await store.scanKeys(`${options.keyPrefix}*`);
    const removed = await store.del(keys);
    log(`Flushed ${removed} existing key(s) under "${options.keyPrefix}"`);
  }

  // Phase 1: direct targets.
  const bodies = new Map<string, unknown>();
  const phaseOne = await mapWithConcurrency(direct, options.concurrency, async (target) => {
    const outcome = await executeAndStore(
      {
        name: target.name,
        routePath: target.path,
        query: target.query,
        ttlSeconds: target.ttlSeconds ?? options.ttlSeconds,
      },
      options,
      store,
      fetchImpl,
    );
    if (outcome.body !== undefined) bodies.set(target.name, outcome.body);
    return outcome.result;
  });

  // Phase 2: expand per-entity targets from seed responses.
  const requests: ConcreteRequest[] = [];
  for (const target of expanded) {
    const { source, field, param } = target.expandFrom!;
    const ids = extractIds(bodies.get(source), field, options.maxExpansions);
    if (ids.length === 0)
      log(`- ${target.name}: no "${field}" values found in ${source}, skipping`);
    for (const id of ids) {
      requests.push({
        name: `${target.name}[${id}]`,
        routePath: target.path.split(`:${param}`).join(encodeURIComponent(id)),
        query: target.query,
        ttlSeconds: target.ttlSeconds ?? options.ttlSeconds,
      });
    }
  }
  const phaseTwo = await mapWithConcurrency(
    requests,
    options.concurrency,
    async (request) => (await executeAndStore(request, options, store, fetchImpl)).result,
  );

  const results = [...phaseOne, ...phaseTwo];
  for (const result of results) {
    const mark = result.error ? '✗' : '✓';
    const detail =
      result.error ??
      `${result.status} ${result.bytes}B${result.cached ? ` → ${result.key}` : ' (dry run)'}`;
    log(`${mark} ${result.name} (${result.durationMs}ms) ${detail}`);
  }
  return results;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function loadTargets(file: string): WarmTarget[] {
  const parsed = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`${file} must contain a JSON array of targets`);
  return parsed.map((entry, index) => {
    const target = entry as WarmTarget;
    if (!target || typeof target.name !== 'string' || typeof target.path !== 'string') {
      throw new Error(`Target #${index} in ${file} needs string "name" and "path"`);
    }
    if (!target.path.startsWith('/'))
      throw new Error(`Target "${target.name}" path must start with "/"`);
    return target;
  });
}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): WarmOptions {
  const options: WarmOptions = {
    baseUrl: env.API_BASE_URL ?? 'http://localhost:3000',
    prefix: env.API_PREFIX ?? '',
    redisUrl: resolveRedisUrl(env),
    keyPrefix: env.CACHE_WARM_KEY_PREFIX ?? 'ext-cache:',
    ttlSeconds: 300,
    targets: DEFAULT_WARM_TARGETS,
    concurrency: 4,
    maxExpansions: 20,
    token: env.API_TOKEN,
    timeoutMs: 10000,
    dryRun: false,
    flush: false,
  };

  const positiveInt = (flag: string, value: string): number => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0)
      throw new Error(`${flag} must be a positive integer`);
    return parsed;
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
      case '--base-url':
        options.baseUrl = next();
        break;
      case '--prefix':
        options.prefix = next();
        break;
      case '--redis-url':
        options.redisUrl = next();
        break;
      case '--key-prefix':
        options.keyPrefix = next();
        break;
      case '--ttl':
        options.ttlSeconds = positiveInt(flag, next());
        break;
      case '--targets':
        options.targets = loadTargets(next());
        break;
      case '--only':
        options.only = new RegExp(next());
        break;
      case '--concurrency':
        options.concurrency = positiveInt(flag, next());
        break;
      case '--max-expansions':
        options.maxExpansions = positiveInt(flag, next());
        break;
      case '--token':
        options.token = next();
        break;
      case '--timeout':
        options.timeoutMs = positiveInt(flag, next());
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--flush':
        options.flush = true;
        break;
      default:
        throw new Error(`Unknown option "${flag}"`);
    }
  }
  return options;
}

async function main(): Promise<void> {
  let options: WarmOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(2);
  }

  const store = options.dryRun ? undefined : createRedisStore(options.redisUrl);
  const started = Date.now();
  try {
    console.log(
      `Warming ${options.targets.length} target(s) from ${options.baseUrl}${options.dryRun ? ' (dry run)' : ''}`,
    );
    const results = await warmCache(options, store);
    const failed = results.filter((result) => result.error).length;
    console.log(
      `\nDone in ${Date.now() - started}ms: ${results.length - failed} warmed, ${failed} failed.`,
    );
    await store?.quit();
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error(`Fatal: ${(error as Error).message}`);
    await store?.quit().catch(() => undefined);
    process.exit(2);
  }
}

if (require.main === module) {
  void main();
}
