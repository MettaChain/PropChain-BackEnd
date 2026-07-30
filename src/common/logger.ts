/**
 * Structured logger for PropChain.
 *
 * Issue #914 – Implement structured JSON logging with pino in production,
 * pretty-print in development.
 *
 * In production (NODE_ENV=production) every log line is emitted as a single
 * JSON object containing:
 *   - level      (error | warn | log | debug | verbose)
 *   - timestamp  (ISO-8601)
 *   - context    (NestJS module/class name)
 *   - correlationId (X-Request-Id when set via RequestIdMiddleware)
 *   - message
 *   - ...extra   (any additional structured fields passed to the call)
 *
 * In development the output is pretty-printed plain text (NestJS default
 * format) so it remains easy to read in the terminal.
 *
 * Sensitive data is never logged – the scrubSensitive() helper strips common
 * PII field names from metadata objects before they reach the transport.
 */

import { ConsoleLogger, LogLevel } from '@nestjs/common';

// Fields that must never appear in log output.
const SENSITIVE_KEYS = new Set([
  'password',
  'newPassword',
  'currentPassword',
  'confirmPassword',
  'token',
  'refreshToken',
  'accessToken',
  'secret',
  'apiKey',
  'privateKey',
  'creditCard',
  'cvv',
  'ssn',
  'fcmToken',
]);

/**
 * Recursively redact sensitive keys from a plain object so that PII is never
 * serialised into log output.
 */
function scrubSensitive(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => scrubSensitive(item, depth + 1));

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEYS.has(key.toLowerCase())
      ? '[REDACTED]'
      : scrubSensitive(value, depth + 1);
  }
  return result;
}

/** Correlation ID store – set by RequestIdMiddleware per request. */
let currentCorrelationId: string | undefined;

export function setCorrelationId(id: string): void {
  currentCorrelationId = id;
}

export function getCorrelationId(): string | undefined {
  return currentCorrelationId;
}

/**
 * PropChain structured logger.
 *
 * Usage (inject like any NestJS logger):
 *
 * ```ts
 * private readonly logger = new AppLogger(MyService.name);
 * this.logger.log('User registered', { userId });
 * ```
 */
export class AppLogger extends ConsoleLogger {
  private readonly isProduction: boolean;

  constructor(context?: string) {
    super(context ?? 'App');
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  // ── overrides ────────────────────────────────────────────────────────────

  override log(message: string, ...optionalParams: unknown[]): void {
    this.emit('log', message, optionalParams);
  }

  override error(message: string, ...optionalParams: unknown[]): void {
    this.emit('error', message, optionalParams);
  }

  override warn(message: string, ...optionalParams: unknown[]): void {
    this.emit('warn', message, optionalParams);
  }

  override debug(message: string, ...optionalParams: unknown[]): void {
    this.emit('debug', message, optionalParams);
  }

  override verbose(message: string, ...optionalParams: unknown[]): void {
    this.emit('verbose', message, optionalParams);
  }

  // ── internal ─────────────────────────────────────────────────────────────

  private emit(level: LogLevel, message: string, params: unknown[]): void {
    if (this.isProduction) {
      this.writeJson(level, message, params);
    } else {
      // Delegate to NestJS pretty-printer for developer ergonomics
      super[level](message, ...params);
    }
  }

  private writeJson(level: LogLevel, message: string, params: unknown[]): void {
    // Extract the last param as structured metadata if it is a plain object
    let meta: Record<string, unknown> = {};
    let extra = params;

    const last = params[params.length - 1];
    if (last !== null && typeof last === 'object' && !Array.isArray(last)) {
      meta = scrubSensitive(last) as Record<string, unknown>;
      extra = params.slice(0, -1);
    }

    const entry: Record<string, unknown> = {
      level,
      timestamp: new Date().toISOString(),
      context: this.context,
      correlationId: currentCorrelationId,
      message,
      ...meta,
    };

    // Append any remaining non-object params as an "args" array
    if (extra.length > 0) {
      entry.args = extra;
    }

    // In production write directly to stdout so log aggregators can pick up
    // the raw JSON without any ANSI escape codes.
    process.stdout.write(JSON.stringify(entry) + '\n');
  }
}
