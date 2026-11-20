import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface PrismaField {
  name: string;
  type: string;
  isList: boolean;
  isOptional: boolean;
  attributes: string[];
  isId: boolean;
  isUnique: boolean;
  hasDefault: boolean;
  relation?: string;
  map?: string;
}

export interface PrismaIndex {
  kind: 'index' | 'unique' | 'id';
  fields: string[];
  raw: string;
}

export interface PrismaModel {
  name: string;
  mapName?: string;
  fields: PrismaField[];
  indexes: PrismaIndex[];
}

export interface PrismaEnum {
  name: string;
  values: string[];
}

export interface PrismaSchema {
  models: Map<string, PrismaModel>;
  enums: Map<string, PrismaEnum>;
}

export function getRepoRoot(): string {
  return path.resolve(__dirname, '../../..');
}

export function getReportsDir(): string {
  return path.join(getRepoRoot(), 'api-extensions', 'reports');
}

export function readSchemaSource(source: string, repoRoot = getRepoRoot()): string {
  if (source === 'HEAD') {
    return execFileSync('git', ['show', 'HEAD:prisma/schema.prisma'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
  }
  return fs.readFileSync(path.resolve(repoRoot, source), 'utf8');
}

export function writeReport(fileName: string, contents: string): string {
  const directory = getReportsDir();
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, fileName);
  fs.writeFileSync(target, contents, 'utf8');
  return target;
}

export function parsePrismaSchema(source: string): PrismaSchema {
  const models = new Map<string, PrismaModel>();
  const enums = new Map<string, PrismaEnum>();
  const lines = source.split(/\r?\n/);
  let currentModel: PrismaModel | undefined;
  let currentEnum: PrismaEnum | undefined;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\/\/.*$/, '').trim();
    if (!line) continue;

    if (currentEnum) {
      if (line === '}') {
        enums.set(currentEnum.name, currentEnum);
        currentEnum = undefined;
      } else {
        currentEnum.values.push(line.split(/\s+/)[0]);
      }
      continue;
    }

    if (currentModel) {
      if (line === '}') {
        models.set(currentModel.name, currentModel);
        currentModel = undefined;
      } else if (line.startsWith('@@')) {
        const index = parseIndex(line);
        if (index) currentModel.indexes.push(index);
        const map = /@@map\(\s*"([^"]+)"/.exec(line);
        if (map) currentModel.mapName = map[1];
      } else {
        const field = parseField(line);
        if (field) currentModel.fields.push(field);
      }
      continue;
    }

    const modelMatch = /^model\s+(\w+)\s*\{/.exec(line);
    if (modelMatch) {
      currentModel = { name: modelMatch[1], fields: [], indexes: [] };
      continue;
    }
    const enumMatch = /^enum\s+(\w+)\s*\{/.exec(line);
    if (enumMatch) {
      currentEnum = { name: enumMatch[1], values: [] };
    }
  }

  if (currentModel) models.set(currentModel.name, currentModel);
  if (currentEnum) enums.set(currentEnum.name, currentEnum);
  return { models, enums };
}

function parseField(line: string): PrismaField | undefined {
  const match = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(line);
  if (!match) return undefined;
  const [, name, type, list, optional, rest] = match;
  const attributes = rest.match(/@[\w]+(?:\([^)]*\))?/g) ?? [];
  const relation = attributes.find((attribute) => attribute.startsWith('@relation'));
  const map = /@map\(\s*"([^"]+)"/.exec(rest)?.[1];
  return {
    name,
    type,
    isList: Boolean(list),
    isOptional: Boolean(optional),
    attributes,
    isId: attributes.some((attribute) => attribute.startsWith('@id')),
    isUnique: attributes.some((attribute) => attribute.startsWith('@unique')),
    hasDefault: attributes.some((attribute) => attribute.startsWith('@default')),
    relation,
    map,
  };
}

function parseIndex(line: string): PrismaIndex | undefined {
  const match = /^@@(index|unique|id)\s*\(\s*\[([^\]]*)\]/.exec(line);
  if (!match) return undefined;
  const fields = match[2]
    .split(',')
    .map((field) => field.trim().replace(/\(.*$/, '').replace(/["`]/g, ''))
    .filter(Boolean);
  return { kind: match[1] as PrismaIndex['kind'], fields, raw: line };
}

export function indexPrefixes(model: PrismaModel): Set<string> {
  const prefixes = new Set<string>();
  for (const index of model.indexes) {
    if (index.fields.length === 0) continue;
    prefixes.add(index.fields[0]);
    if (index.fields.length > 1) prefixes.add(index.fields.join(','));
  }
  for (const field of model.fields) {
    if (field.isId || field.isUnique) prefixes.add(field.name);
  }
  return prefixes;
}
