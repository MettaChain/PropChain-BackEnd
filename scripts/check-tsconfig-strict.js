#!/usr/bin/env node
/**
 * CI guard: fail if the app build config weakens TypeScript strictness.
 *
 * README "Developer Requirements" promises strict mode, noImplicitAny and
 * strictNullChecks for app builds. This script checks that tsconfig.json and
 * tsconfig.app.json (which extends it) keep those flags on after resolution.
 *
 * Usage: node scripts/check-tsconfig-strict.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIGS = ['tsconfig.json', 'tsconfig.app.json'];

// Flags that must resolve to true. Flags implied by `strict` are listed so an
// explicit `false` override is also caught.
const REQUIRED_TRUE = [
  'strict',
  'noImplicitAny',
  'strictNullChecks',
  'strictFunctionTypes',
  'strictBindCallApply',
  'noImplicitThis',
  'alwaysStrict',
  'useUnknownInCatchVariables',
  'noImplicitOverride',
];

// Implied by `strict`; an explicit false is still a violation.
const IMPLIED_BY_STRICT = new Set([
  'noImplicitAny',
  'strictNullChecks',
  'strictFunctionTypes',
  'strictBindCallApply',
  'noImplicitThis',
  'alwaysStrict',
  'useUnknownInCatchVariables',
]);

function readJsonc(file) {
  const text = fs.readFileSync(file, 'utf8');
  // Strip // and /* */ comments and trailing commas (tsconfig allows them).
  const stripped = text
    .replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str ?? '')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(stripped);
}

function resolveCompilerOptions(file) {
  const config = readJsonc(file);
  let base = {};
  if (config.extends) {
    base = resolveCompilerOptions(path.resolve(path.dirname(file), config.extends));
  }
  return { ...base, ...(config.compilerOptions ?? {}) };
}

const failures = [];
for (const name of CONFIGS) {
  const options = resolveCompilerOptions(path.join(ROOT, name));
  for (const flag of REQUIRED_TRUE) {
    const value = options[flag];
    const ok = value === true || (value === undefined && IMPLIED_BY_STRICT.has(flag) && options.strict === true);
    if (!ok) failures.push(`${name}: "${flag}" resolves to ${JSON.stringify(value)} (expected true)`);
  }
}

if (failures.length) {
  console.error('TypeScript strictness check failed:\n  ' + failures.join('\n  '));
  console.error('\nSee README "Developer Requirements — TypeScript & Linting".');
  process.exit(1);
}

console.log(`TypeScript strictness check passed for ${CONFIGS.join(', ')}.`);
