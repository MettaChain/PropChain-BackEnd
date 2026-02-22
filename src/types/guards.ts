// Type guard utilities for runtime type checking

// Primitive type guards
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isNull(value: unknown): value is null {
  return value === null;
}

export function isUndefined(value: unknown): value is undefined {
  return value === undefined;
}

export function isBigInt(value: unknown): value is bigint {
  return typeof value === 'bigint';
}

export function isSymbol(value: unknown): value is symbol {
  return typeof value === 'symbol';
}

// Object type guards
export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isFunction(value: unknown): value is (...args: any[]) => any {
  return typeof value === 'function';
}

export function isDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

export function isRegExp(value: unknown): value is RegExp {
  return value instanceof RegExp;
}

export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

export function isPromise<T>(value: unknown): value is Promise<T> {
  return value instanceof Promise;
}

// Utility type guards
export function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.length > 0;
}

export function isNonEmptyArray<T>(value: unknown): value is T[] {
  return isArray(value) && value.length > 0;
}

export function isPositiveNumber(value: unknown): value is number {
  return isNumber(value) && value > 0;
}

export function isNonNegativeNumber(value: unknown): value is number {
  return isNumber(value) && value >= 0;
}

export function isInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value);
}

export function isSafeInteger(value: unknown): value is number {
  return isNumber(value) && Number.isSafeInteger(value);
}

// Email validation type guard
export function isEmail(value: unknown): value is string {
  if (!isString(value)) return false;
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value) && value.length <= 254;
}

// UUID validation type guard
export function isUUID(value: unknown): value is string {
  if (!isString(value)) return false;
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

// URL validation type guard
export function isUrl(value: unknown): value is string {
  if (!isString(value)) return false;
  
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// JSON validation type guard
export function isJsonString(value: unknown): value is string {
  if (!isString(value)) return false;
  
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function isValidJson(value: unknown): boolean {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

// Array utility type guards
export function hasLength<T>(value: T[], length: number): value is T[] {
  return value.length === length;
}

export function hasMinLength<T>(value: T[], minLength: number): value is T[] {
  return value.length >= minLength;
}

export function hasMaxLength<T>(value: T[], maxLength: number): value is T[] {
  return value.length <= maxLength;
}

// Object utility type guards
export function hasProperty<T extends Record<string, unknown>, K extends string>(
  obj: T,
  key: K
): obj is T & Record<K, unknown> {
  return key in obj;
}

export function hasOwnProperty<T extends Record<string, unknown>, K extends string>(
  obj: T,
  key: K
): obj is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function isObjectOfType<T extends Record<string, unknown>>(
  value: unknown,
  schema: Record<keyof T, (value: unknown) => boolean>
): value is T {
  if (!isObject(value)) return false;
  
  return Object.keys(schema).every(key => {
    const validator = schema[key as keyof T];
    return validator && hasProperty(value, key) && validator(value[key]);
  });
}

// Async type guards
export async function isPromiseResolved<T>(promise: Promise<T>): Promise<boolean> {
  try {
    await promise;
    return true;
  } catch {
    return false;
  }
}

// Custom assertion functions
export function assertString(value: unknown, message = 'Expected a string'): asserts value is string {
  if (!isString(value)) {
    throw new TypeError(message);
  }
}

export function assertNumber(value: unknown, message = 'Expected a number'): asserts value is number {
  if (!isNumber(value)) {
    throw new TypeError(message);
  }
}

export function assertBoolean(value: unknown, message = 'Expected a boolean'): asserts value is boolean {
  if (!isBoolean(value)) {
    throw new TypeError(message);
  }
}

export function assertObject(value: unknown, message = 'Expected an object'): asserts value is Record<string, unknown> {
  if (!isObject(value)) {
    throw new TypeError(message);
  }
}

export function assertArray(value: unknown, message = 'Expected an array'): asserts value is unknown[] {
  if (!isArray(value)) {
    throw new TypeError(message);
  }
}

export function assertNonEmptyString(value: unknown, message = 'Expected a non-empty string'): asserts value is string {
  if (!isNonEmptyString(value)) {
    throw new TypeError(message);
  }
}

export function assertNonEmptyArray<T>(value: unknown, message = 'Expected a non-empty array'): asserts value is T[] {
  if (!isNonEmptyArray(value)) {
    throw new TypeError(message);
  }
}

// Type narrowing utilities
export function asString(value: unknown, defaultValue = ''): string {
  return isString(value) ? value : defaultValue;
}

export function asNumber(value: unknown, defaultValue = 0): number {
  return isNumber(value) ? value : defaultValue;
}

export function asBoolean(value: unknown, defaultValue = false): boolean {
  return isBoolean(value) ? value : defaultValue;
}

export function asArray<T>(value: unknown, defaultValue: T[] = []): T[] {
  return isArray(value) ? value as T[] : defaultValue;
}

export function asObject<T extends Record<string, unknown>>(value: unknown, defaultValue: T): T {
  return isObject(value) ? value as T : defaultValue;
}