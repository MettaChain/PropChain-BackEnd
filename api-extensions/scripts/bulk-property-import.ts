import { PrismaClient, PropertyStatus } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { writeReport } from './lib/prisma-schema';

interface ImportOptions {
  input: string;
  dryRun: boolean;
  batchSize: number;
  threshold: number;
  checkDuplicates: boolean;
  output?: string;
}

interface SourceRow {
  title?: unknown;
  address?: unknown;
  city?: unknown;
  state?: unknown;
  zipCode?: unknown;
  zip_code?: unknown;
  price?: unknown;
  propertyType?: unknown;
  property_type?: unknown;
  ownerId?: unknown;
  owner_id?: unknown;
  description?: unknown;
  bedrooms?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  status?: unknown;
}

interface ImportRecord {
  title: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  price: number;
  propertyType: string;
  ownerId: string;
  description?: string;
  bedrooms?: number;
  latitude?: number;
  longitude?: number;
  status: PropertyStatus;
}

interface RowError {
  row: number;
  field: string;
  message: string;
}

interface ImportSummary {
  input: string;
  dryRun: boolean;
  totalRows: number;
  imported: number;
  skipped: number;
  duplicates: number;
  batches: number;
  elapsedMs: number;
  errors: RowError[];
}

interface ComparableProperty {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  latitude: number | null;
  longitude: number | null;
}

const USAGE = `Bulk Property Import

Usage:
  ts-node api-extensions/scripts/bulk-property-import.ts --input <file.csv|file.json> [options]

Options:
  --input <path>            CSV or JSON file to import (required)
  --dry-run                 Validate and deduplicate without writing to the database
  --batch-size <number>     Records per createMany batch (default: 100)
  --duplicate-threshold <n> Address similarity threshold from 0 to 1 (default: 0.88)
  --no-duplicate-check      Skip duplicate lookup against existing properties
  --output <path>           Write the JSON summary to a file
  --help                    Show this message
`;

export function parseImportOptions(argv: string[]): ImportOptions {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  const option = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const input = option('--input');
  if (!input) throw new Error('Missing required option --input <path>');

  const batchSize = Number(option('--batch-size') ?? 100);
  const threshold = Number(option('--duplicate-threshold') ?? 0.88);
  if (!Number.isInteger(batchSize) || batchSize < 1)
    throw new Error('--batch-size must be a positive integer');
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error('--duplicate-threshold must be between 0 and 1');
  }

  return {
    input: path.resolve(input),
    dryRun: argv.includes('--dry-run'),
    batchSize,
    threshold,
    checkDuplicates: !argv.includes('--no-duplicate-check') && !argv.includes('--dry-run'),
    output: option('--output'),
  };
}

export function readRows(inputPath: string): SourceRow[] {
  if (!fs.existsSync(inputPath)) throw new Error(`Input file not found: ${inputPath}`);
  const contents = fs.readFileSync(inputPath, 'utf8');
  if (inputPath.toLowerCase().endsWith('.json')) {
    const parsed: unknown = JSON.parse(contents);
    const rows = Array.isArray(parsed) ? parsed : (parsed as { properties?: unknown[] }).properties;
    if (!Array.isArray(rows))
      throw new Error('JSON input must be an array or an object with a properties array');
    return rows as SourceRow[];
  }
  if (inputPath.toLowerCase().endsWith('.csv')) {
    return parse(contents, { columns: true, skip_empty_lines: true, trim: true }) as SourceRow[];
  }
  throw new Error('Input must be a .csv or .json file');
}

export function validateRow(
  row: SourceRow,
  rowNumber: number,
): { record?: ImportRecord; errors: RowError[] } {
  const errors: RowError[] = [];
  const required: Array<keyof SourceRow> = [
    'title',
    'address',
    'city',
    'state',
    'zipCode',
    'price',
    'propertyType',
    'ownerId',
  ];
  for (const field of required) {
    const value = row[field] ?? row[alternateField(field)];
    if (value === undefined || value === null || String(value).trim() === '') {
      errors.push({ row: rowNumber, field, message: `${field} is required` });
    }
  }

  const price = Number(row.price);
  if (!Number.isFinite(price) || price <= 0) {
    errors.push({ row: rowNumber, field: 'price', message: 'price must be a positive number' });
  }
  const ownerId = String(row.ownerId ?? row.owner_id ?? '');
  if (ownerId && !isUuid(ownerId)) {
    errors.push({ row: rowNumber, field: 'ownerId', message: 'ownerId must be a UUID' });
  }
  const bedrooms =
    row.bedrooms === undefined || row.bedrooms === '' ? undefined : Number(row.bedrooms);
  if (bedrooms !== undefined && (!Number.isInteger(bedrooms) || bedrooms < 0)) {
    errors.push({
      row: rowNumber,
      field: 'bedrooms',
      message: 'bedrooms must be a non-negative integer',
    });
  }
  const latitude = optionalNumber(row.latitude);
  const longitude = optionalNumber(row.longitude);
  if (latitude !== undefined && (latitude < -90 || latitude > 90)) {
    errors.push({ row: rowNumber, field: 'latitude', message: 'latitude is out of range' });
  }
  if (longitude !== undefined && (longitude < -180 || longitude > 180)) {
    errors.push({ row: rowNumber, field: 'longitude', message: 'longitude is out of range' });
  }
  const status = String(row.status ?? 'DRAFT').toUpperCase();
  if (!(status in PropertyStatus)) {
    errors.push({ row: rowNumber, field: 'status', message: `unsupported status ${status}` });
  }
  if (errors.length > 0) return { errors };

  return {
    errors,
    record: {
      title: String(row.title),
      address: String(row.address),
      city: String(row.city),
      state: String(row.state),
      zipCode: String(row.zipCode ?? row.zip_code),
      price,
      propertyType: String(row.propertyType ?? row.property_type),
      ownerId,
      description: row.description === undefined ? undefined : String(row.description),
      bedrooms,
      latitude,
      longitude,
      status: status as PropertyStatus,
    },
  };
}

export function normalizeAddress(
  record: Pick<ImportRecord, 'address' | 'city' | 'state' | 'zipCode'>,
): string {
  return [record.address, record.city, record.state, record.zipCode]
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function addressSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  const maxLength = Math.max(left.length, right.length);
  if (maxLength === 0) return 1;
  const distance = levenshtein(left, right);
  return 1 - distance / maxLength;
}

export function isDuplicate(
  record: ImportRecord,
  existing: ComparableProperty,
  threshold: number,
): boolean {
  const similarity = addressSimilarity(normalizeAddress(record), normalizeAddress(existing));
  if (similarity >= threshold) return true;
  if (
    record.latitude === undefined ||
    record.longitude === undefined ||
    existing.latitude === null ||
    existing.longitude === null
  ) {
    return false;
  }
  return (
    distanceInMeters(record.latitude, record.longitude, existing.latitude, existing.longitude) < 50
  );
}

async function loadExisting(prisma: PrismaClient): Promise<ComparableProperty[]> {
  return prisma.property.findMany({
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      latitude: true,
      longitude: true,
    },
    take: 10000,
  });
}

export async function importProperties(
  options: ImportOptions,
  prisma?: PrismaClient,
): Promise<ImportSummary> {
  const startedAt = Date.now();
  const rows = readRows(options.input);
  const summary: ImportSummary = {
    input: options.input,
    dryRun: options.dryRun,
    totalRows: rows.length,
    imported: 0,
    skipped: 0,
    duplicates: 0,
    batches: 0,
    elapsedMs: 0,
    errors: [],
  };
  const accepted: ImportRecord[] = [];
  const seenAddresses: ComparableProperty[] = [];
  let existing: ComparableProperty[] = [];

  if (options.checkDuplicates && prisma) {
    existing = await loadExisting(prisma);
  }

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const { record, errors } = validateRow(row, rowNumber);
    summary.errors.push(...errors);
    if (!record) {
      summary.skipped += 1;
      return;
    }
    const duplicate = [...existing, ...seenAddresses].find((candidate) =>
      isDuplicate(record, candidate, options.threshold),
    );
    if (duplicate) {
      summary.duplicates += 1;
      summary.skipped += 1;
      return;
    }
    seenAddresses.push({
      id: `input-${rowNumber}`,
      address: record.address,
      city: record.city,
      state: record.state,
      zipCode: record.zipCode,
      latitude: record.latitude ?? null,
      longitude: record.longitude ?? null,
    });
    accepted.push(record);
  });

  for (let offset = 0; offset < accepted.length; offset += options.batchSize) {
    const batch = accepted.slice(offset, offset + options.batchSize);
    if (!options.dryRun && prisma) {
      await prisma.property.createMany({
        data: batch.map((record) => ({
          title: record.title,
          address: record.address,
          city: record.city,
          state: record.state,
          zipCode: record.zipCode,
          price: record.price,
          propertyType: record.propertyType,
          ownerId: record.ownerId,
          description: record.description,
          bedrooms: record.bedrooms,
          latitude: record.latitude,
          longitude: record.longitude,
          status: record.status,
        })),
        skipDuplicates: true,
      });
    }
    summary.imported += batch.length;
    summary.batches += 1;
    process.stdout.write(
      `[${summary.batches}] processed ${summary.imported}/${accepted.length} valid records` +
        `${options.dryRun ? ' (dry run)' : ''}\n`,
    );
  }

  summary.elapsedMs = Date.now() - startedAt;
  const report = JSON.stringify(summary, null, 2);
  if (options.output) {
    const target = path.resolve(options.output);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, report, 'utf8');
  } else {
    writeReport('property-import-summary.json', report);
  }
  process.stdout.write(`${report}\n`);
  return summary;
}

function alternateField(field: keyof SourceRow): keyof SourceRow {
  return field === 'zipCode'
    ? 'zip_code'
    : field === 'propertyType'
      ? 'property_type'
      : field === 'ownerId'
        ? 'owner_id'
        : field;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function levenshtein(left: string, right: string): number {
  const matrix = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );
  for (let row = 0; row <= left.length; row += 1) matrix[row][0] = row;
  for (let column = 0; column <= right.length; column += 1) matrix[0][column] = column;
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      );
    }
  }
  return matrix[left.length][right.length];
}

function distanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseImportOptions(argv);
  let prisma: PrismaClient | undefined;
  try {
    if (!options.dryRun) prisma = new PrismaClient();
    const summary = await importProperties(options, prisma);
    process.exitCode = summary.errors.length > 0 ? 1 : 0;
  } finally {
    await prisma?.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: Error) => {
    process.stderr.write(`Import failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
