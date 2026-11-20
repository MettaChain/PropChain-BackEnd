// @ts-nocheck
// (Mirrors prisma/seed.ts: extension models may not exist in the generated
// Prisma client yet, so no generated model types are referenced here.)

/**
 * Seed realistic data for extension modules under `api-extensions/`.
 *
 * Modules seeded (when their Prisma delegate exists):
 *   1. property valuations   2. property inspections   3. maintenance requests
 *   4. leases                5. tenant screenings      6. commission splits
 *
 * Usage (from the repository root):
 *   npx ts-node api-extensions/scripts/seed-extension-modules.ts          # 10 records / module
 *   npx ts-node api-extensions/scripts/seed-extension-modules.ts 25       # 25 records / module
 *   SEED_ENV=staging npx ts-node api-extensions/scripts/seed-extension-modules.ts 5
 *   SEED_DRY_RUN=true npx ts-node api-extensions/scripts/seed-extension-modules.ts 5
 *
 * Environment:
 *   DATABASE_URL                 Required by PrismaClient (same as prisma/seed.ts).
 *   SEED_ENV                     Logical seed namespace (default: development).
 *   SEED_EXTENSION_VOLUME        Alternative to the CLI count argument.
 *   SEED_ALLOW_IN_PRODUCTION     Must be "true" when NODE_ENV=production.
 *   SEED_DRY_RUN                 "true" prints the plan without writing.
 *
 * Safety / idempotency:
 *   - All writes run in ONE interactive transaction; any error rolls everything back.
 *   - Every record gets a deterministic UUID derived from
 *     `<SEED_ENV>:<module>:<index>`, and is upserted by `id`, so reruns do not
 *     create duplicates (existing rows are left untouched).
 *   - Only the six extension modules above are written. Base rows (users,
 *     properties, transactions) are READ-ONLY; run `npm run db:seed` first.
 *   - The current `prisma/schema.prisma` has no extension models, so delegates
 *     are detected at runtime. Unavailable modules are skipped and reported
 *     instead of crashing the script. If your generated model uses a primary
 *     key other than `id`, adapt `seedModule()`.
 */

import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_VOLUME = 10;
const MAX_VOLUME = 500;
const seedEnvironment = process.env.SEED_ENV || 'development';
const dryRun = ['true', '1'].includes((process.env.SEED_DRY_RUN ?? '').toLowerCase());

type AnyRecord = Record<string, any>;

interface BaseData {
  users: AnyRecord[];
  agents: AnyRecord[];
  properties: AnyRecord[];
  transactions: AnyRecord[];
  warnings: string[];
}

interface ModulePlan {
  name: string;
  delegateName: string;
  records: AnyRecord[];
  reason?: string;
}

interface ModuleResult {
  module: string;
  status: 'seeded' | 'skipped' | 'planned';
  inserted: number;
  unchanged: number;
  delegateName?: string;
  reason?: string;
}

function assertSeedingAllowed(): void {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.SEED_ALLOW_IN_PRODUCTION !== 'true'
  ) {
    throw new Error(
      'Extension seeding is disabled in production. Set SEED_ALLOW_IN_PRODUCTION=true to override.',
    );
  }
}

function parseVolume(argv: string[]): number {
  const raw = argv[2] ?? process.env.SEED_EXTENSION_VOLUME ?? String(DEFAULT_VOLUME);
  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `Invalid volume "${raw}". Usage: ts-node api-extensions/scripts/seed-extension-modules.ts [1-${MAX_VOLUME}]`,
    );
  }
  const volume = Number(raw);
  if (volume < 1 || volume > MAX_VOLUME) {
    throw new Error(`Volume must be between 1 and ${MAX_VOLUME} (received ${volume}).`);
  }
  return volume;
}

function hashString(value: string): number {
  return createHash('sha256').update(value).digest().readUInt32BE(0);
}

/** Small deterministic PRNG so repeated runs generate the same fixture values. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RFC-4122-shaped v5 UUID derived from a deterministic seed key. */
function seedUuid(key: string): string {
  const hash = createHash('sha1').update(key).digest('hex');
  const variant = ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `${variant}${hash.slice(17, 19)}`,
    hash.slice(19, 31),
  ].join('-');
}

function makeHelpers(seed: string) {
  const random = mulberry32(hashString(seed));
  const int = (min: number, max: number): number =>
    Math.floor(random() * (max - min + 1)) + min;
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
  const round2 = (value: number): number => Math.round(value * 100) / 100;
  const daysFromNow = (days: number): Date =>
    new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const isoDaysFromNow = (days: number): string => daysFromNow(days).toISOString();
  const key = (module: string, index: number): string =>
    `${seedEnvironment}:${module}:${String(index).padStart(4, '0')}`;
  return { random, int, pick, round2, isoDaysFromNow, key };
}

/** Read base rows best-effort; never create or modify core tables. */
async function safeFindMany(
  delegate: any,
  args: AnyRecord,
  label: string,
  warnings: string[],
): Promise<AnyRecord[]> {
  if (!delegate || typeof delegate.findMany !== 'function') {
    warnings.push(`${label}: delegate unavailable`);
    return [];
  }
  try {
    return await delegate.findMany(args);
  } catch (error) {
    // Schema drift fallback: retry without filters rather than skipping the
    // whole run (e.g. an older database without `isDeactivated`).
    try {
      return await delegate.findMany({ take: args.take ?? 200 });
    } catch (fallbackError) {
      warnings.push(
        `${label}: findMany failed (${error instanceof Error ? error.message : String(error)})`,
      );
      return [];
    }
  }
}

async function loadBaseData(): Promise<BaseData> {
  const warnings: string[] = [];
  const users = await safeFindMany(
    prisma.user,
    {
      where: { isDeactivated: false },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
      take: 200,
    },
    'user',
    warnings,
  );
  const properties = await safeFindMany(
    prisma.property,
    {
      where: { deleted: false },
      select: { id: true, price: true, ownerId: true, city: true, state: true },
      take: 200,
    },
    'property',
    warnings,
  );
  const transactions = await safeFindMany(
    prisma.transaction,
    {
      where: { deleted: false },
      select: { id: true, propertyId: true, amount: true, status: true },
      take: 200,
    },
    'transaction',
    warnings,
  );

  return {
    users,
    agents: users.filter((user) => user.role === 'AGENT' || user.role === 'ADMIN'),
    properties,
    transactions,
    warnings,
  };
}

/** Candidate delegate names are checked in order (schema names vary). */
function resolveDelegateName(client: any, candidates: string[]): string | null {
  for (const name of candidates) {
    const delegate = client?.[name];
    if (delegate && typeof delegate.upsert === 'function' && typeof delegate.findMany === 'function') {
      return name;
    }
  }
  return null;
}

function skipped(module: string, reason: string): ModulePlan {
  return { name: module, delegateName: '', records: [], reason };
}

function buildPlans(base: BaseData, volume: number): ModulePlan[] {
  const helpers = makeHelpers(`${seedEnvironment}:${volume}`);

  const delegateCandidates: Record<string, string[]> = {
    'property valuations': ['propertyValuation', 'valuation', 'propertyValuations'],
    'property inspections': ['inspection', 'propertyInspection', 'inspectionAppointment'],
    'maintenance requests': ['maintenanceRequest', 'maintenanceTicket'],
    leases: ['lease', 'rentalLease', 'tenancy'],
    'tenant screenings': ['tenantScreening', 'screening', 'screeningRequest'],
    'commission splits': ['commissionSplit', 'commissionSplitGroup'],
  };

  const plans: ModulePlan[] = [];
  const add = (module: string, records: AnyRecord[]) => {
    const delegateName = resolveDelegateName(prisma, delegateCandidates[module]);
    plans.push(
      delegateName
        ? { name: module, delegateName, records }
        : skipped(module, `no delegate found (tried: ${delegateCandidates[module].join(', ')})`),
    );
  };

  const needsBase = (label: string, rows: AnyRecord[]): boolean => {
    if (rows.length > 0) return true;
    plans.push(skipped(label, 'no base rows available - run the core seed first'));
    return false;
  };

  const { int, pick, round2, isoDaysFromNow, key } = helpers;

  // 1. Property valuations ---------------------------------------------------
  if (needsBase('property valuations', base.properties)) {
    const records: AnyRecord[] = [];
    const methods = ['AUTOMATED_AVM', 'COMPARABLE_SALES', 'HYBRID'];
    for (let i = 0; i < volume; i += 1) {
      const property = pick(base.properties);
      const seedKey = key('valuation', i);
      records.push({
        id: seedUuid(seedKey),
        propertyId: property.id,
        estimatedValue: round2(Number(property.price) * (0.92 + int(0, 16) / 100)),
        confidence: int(55, 96),
        comparableCount: int(3, 15),
        valuationDate: isoDaysFromNow(-int(0, 120)),
        method: pick(methods),
        notes: `Deterministic extension seed ${seedKey}`,
      });
    }
    add('property valuations', records);
  }

  // 2. Property inspections --------------------------------------------------
  if (needsBase('property inspections', base.properties) && needsBase('property inspections', base.users)) {
    const inspectors = base.agents.length > 0 ? base.agents : base.users;
    const records: AnyRecord[] = [];
    const types = ['PRE_PURCHASE', 'RENTAL_MOVE_IN', 'MAINTENANCE', 'ANNUAL'];
    const statuses = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    for (let i = 0; i < volume; i += 1) {
      const property = pick(base.properties);
      const seedKey = key('inspection', i);
      records.push({
        id: seedUuid(seedKey),
        propertyId: property.id,
        inspectorId: pick(inspectors).id,
        scheduledAt: isoDaysFromNow(int(1, 60)),
        status: pick(statuses),
        type: pick(types),
        notes: `Deterministic extension seed ${seedKey}`,
      });
    }
    add('property inspections', records);
  }

  // 3. Maintenance requests --------------------------------------------------
  if (needsBase('maintenance requests', base.properties)) {
    const records: AnyRecord[] = [];
    const templates = [
      ['Leaking kitchen faucet', 'Water dripping from the kitchen faucet base.'],
      ['HVAC not cooling', 'Air conditioner runs but the unit does not cool.'],
      ['Broken balcony lock', 'Balcony door latch no longer engages.'],
      ['Hallway light outage', 'Common area light fixture is not working.'],
      ['Water heater inspection', 'Routine inspection of the water heater and valves.'],
    ];
    const priorities = ['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'];
    const statuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
    for (let i = 0; i < volume; i += 1) {
      const property = pick(base.properties);
      const [title, detail] = pick(templates);
      const seedKey = key('maintenance', i);
      records.push({
        id: seedUuid(seedKey),
        propertyId: property.id,
        title: `${title} - ${i + 1}`,
        description: `${detail} (${seedKey})`,
        priority: pick(priorities),
        status: pick(statuses),
        cost: round2(75 + int(0, 240000) / 100),
        ...(base.agents.length > 0 && int(0, 1) === 1
          ? { assignedTo: pick(base.agents).id }
          : {}),
        createdAt: isoDaysFromNow(-int(0, 90)),
        updatedAt: isoDaysFromNow(-int(0, 15)),
      });
    }
    add('maintenance requests', records);
  }

  // 4. Leases ----------------------------------------------------------------
  if (needsBase('leases', base.properties) && needsBase('leases', base.users)) {
    const records: AnyRecord[] = [];
    const statuses = ['PENDING', 'ACTIVE', 'ACTIVE', 'EXPIRED', 'TERMINATED'];
    for (let i = 0; i < volume; i += 1) {
      const property = pick(base.properties);
      const seedKey = key('lease', i);
      const monthlyRent = round2(Number(property.price) * 0.005 * (0.9 + int(0, 20) / 100));
      const start = -int(1, 365);
      records.push({
        id: seedUuid(seedKey),
        propertyId: property.id,
        tenantId: pick(base.users).id,
        landlordId: property.ownerId,
        startDate: isoDaysFromNow(start),
        endDate: isoDaysFromNow(start + 365),
        monthlyRent,
        depositAmount: round2(monthlyRent),
        status: pick(statuses),
        notes: `Deterministic extension seed ${seedKey}`,
      });
    }
    add('leases', records);
  }

  // 5. Tenant screenings -----------------------------------------------------
  if (needsBase('tenant screenings', base.properties)) {
    const records: AnyRecord[] = [];
    const statuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'COMPLETED', 'FAILED'];
    const recommendations = ['APPROVE', 'CONDITIONAL', 'DENY'];
    for (let i = 0; i < volume; i += 1) {
      const property = pick(base.properties);
      const seedKey = key('screening', i);
      records.push({
        id: seedUuid(seedKey),
        propertyId: property.id,
        applicantName: `Seed Applicant ${i + 1}`,
        // Reserved example.invalid domain: never a deliverable address.
        applicantEmail: `${seedKey.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}@example.invalid`,
        status: pick(statuses),
        creditScore: int(300, 850),
        backgroundStatus: pick(['CLEAR', 'REVIEW']),
        incomeVerified: int(0, 1) === 1,
        overallScore: int(40, 98),
        recommendation: pick(recommendations),
        completedAt: isoDaysFromNow(-int(0, 60)),
      });
    }
    add('tenant screenings', records);
  }

  // 6. Commission splits -----------------------------------------------------
  if (needsBase('commission splits', base.transactions)) {
    const records: AnyRecord[] = [];
    const splitPatterns = [
      [60, 40],
      [50, 30, 20],
      [70, 20, 10],
    ];
    const participantsPool = base.agents.length > 0 ? base.agents : base.users;
    for (let i = 0; i < volume; i += 1) {
      const transaction = pick(base.transactions);
      const seedKey = key('commission-split', i);
      const pattern = pick(splitPatterns);
      const participants = pattern.map((percentage, index) => ({
        userId: participantsPool[index % participantsPool.length].id,
        role: index === 0 ? 'LISTING_AGENT' : index === 1 ? 'BUYER_AGENT' : 'BROKER',
        splitPercentage: percentage,
        payoutStatus: 'PENDING',
      }));
      records.push({
        id: seedUuid(seedKey),
        transactionId: transaction.id,
        propertyId: transaction.propertyId,
        totalAmount: round2(Number(transaction.amount) * 0.05),
        adjustment: 0,
        tier: pick(['STANDARD', 'PREMIUM', 'ELITE']),
        status: pick(['PENDING', 'PAID', 'DISPUTED']),
        participants, // JSON column on most extension implementations
        notes: `Deterministic extension seed ${seedKey}`,
      });
    }
    add('commission splits', records);
  }

  return plans;
}

/** Upsert one module's records by their deterministic id. */
async function seedModule(tx: any, plan: ModulePlan): Promise<ModuleResult> {
  const delegate = tx[plan.delegateName];
  const ids = plan.records.map((record) => record.id);
  const existing = await delegate.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((row: AnyRecord) => row.id));

  for (const record of plan.records) {
    await delegate.upsert({
      where: { id: record.id },
      create: record,
      update: {}, // deterministic fixtures are immutable on rerun
    });
  }

  return {
    module: plan.name,
    status: 'seeded',
    delegateName: plan.delegateName,
    inserted: ids.filter((id) => !existingIds.has(id)).length,
    unchanged: ids.filter((id) => existingIds.has(id)).length,
  };
}

function printSummary(results: ModuleResult[], options: { volume: number; dryRun: boolean; warnings: string[]; failure: string | null }): void {
  console.log('');
  console.log('🌱 Extension module seed summary');
  console.log('──────────────────────────────────────────────────────────');
  console.log(`  Environment: ${seedEnvironment}`);
  console.log(`  Volume:      ${options.volume} records per available module`);
  console.log(`  Mode:        ${options.dryRun ? 'DRY RUN (no writes)' : 'write'}`);
  console.log('──────────────────────────────────────────────────────────');
  for (const result of results) {
    if (result.status === 'skipped') {
      console.log(`  ⏭️  ${result.module.padEnd(22)} skipped: ${result.reason}`);
    } else if (result.status === 'planned') {
      console.log(`  📋 ${result.module.padEnd(22)} planned: ${result.inserted} record(s)`);
    } else {
      console.log(
        `  ✅ ${result.module.padEnd(22)} inserted=${result.inserted} unchanged=${result.unchanged} (${result.delegateName ?? ''})`,
      );
    }
  }
  for (const warning of options.warnings) {
    console.log(`  ⚠️  ${warning}`);
  }
  const inserted = results.reduce((sum, result) => sum + result.inserted, 0);
  const unchanged = results.reduce((sum, result) => sum + result.unchanged, 0);
  console.log('──────────────────────────────────────────────────────────');
  console.log(`  Total inserted: ${inserted} | unchanged: ${unchanged}`);
  if (options.failure) {
    console.error(`  ❌ Failed: ${options.failure}. All writes were rolled back.`);
  } else if (options.dryRun) {
    console.log('  ℹ️  Dry run complete; no changes were written.');
  } else {
    console.log('  🎉 Extension seeding completed successfully!');
  }
}

async function main(): Promise<void> {
  let volume = DEFAULT_VOLUME;
  let failure: string | null = null;
  let results: ModuleResult[] = [];
  let warnings: string[] = [];

  try {
    assertSeedingAllowed();
    volume = parseVolume(process.argv);
    console.log(`🌱 Planning ${volume} records per extension module (env=${seedEnvironment})...`);

    const base = await loadBaseData();
    warnings = base.warnings;
    const plans = buildPlans(base, volume);

    if (dryRun) {
      results = plans.map((plan) => ({
        module: plan.name,
        status: plan.reason ? 'skipped' : 'planned',
        inserted: plan.records.length,
        unchanged: 0,
        reason: plan.reason,
      }));
    } else {
      const writable = plans.filter((plan) => !plan.reason);
      results = plans
        .filter((plan) => plan.reason)
        .map((plan) => ({
          module: plan.name,
          status: 'skipped' as const,
          inserted: 0,
          unchanged: 0,
          reason: plan.reason,
        }));

      if (writable.length > 0) {
        // Every module write participates in this single transaction. If any
        // delegate/field/enum is incompatible, Prisma rolls back ALL modules.
        const seeded = await prisma.$transaction(
          async (tx) => {
            const output: ModuleResult[] = [];
            for (const plan of writable) {
              console.log(`  → seeding ${plan.name} via ${plan.delegateName}...`);
              output.push(await seedModule(tx, plan));
            }
            return output;
          },
          { maxWait: 10_000, timeout: 120_000 },
        );
        results = [...results, ...seeded];
      }
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    console.error('❌ Error seeding extension modules:', error);
    console.error('   Any database changes made in this run have been rolled back.');
  } finally {
    await prisma.$disconnect();
  }

  printSummary(results, { volume, dryRun, warnings, failure });
  if (failure) process.exitCode = 1;
}

main();
