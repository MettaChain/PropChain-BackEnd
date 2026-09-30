/**
 * Canonical error response contract — Issue #1298.
 *
 * Every error response emitted by the API (exception filters, ValidationPipe
 * path, response-format interceptor) shares this single envelope so clients
 * and generated SDKs can rely on one stable shape:
 *
 * ```json
 * {
 *   "success": false,
 *   "statusCode": 400,
 *   "code": "VALIDATION_ERROR",
 *   "message": "Validation failed",
 *   "details": [ ... ],
 *   "traceId": "0f9c7b1e-...",
 *   "timestamp": "2026-09-29T12:00:00.000Z",
 *   "path": "/api/v2/auth/register",
 *   "language": "en"
 * }
 * ```
 *
 * `code` is a stable machine-readable identifier, `traceId` mirrors the
 * `x-trace-id` response header set by the TraceInterceptor, and `details`
 * carries structured, error-type-specific information (e.g. the standardized
 * validation error array or Prisma field errors).
 *
 * Field order is part of the contract: `statusCode` stays adjacent to
 * `success` (legacy position) while `code`/`message`/`details`/`traceId`
 * form the canonical block documented in docs/API_VERSIONING.md.
 */

/** Stable machine-readable error codes exposed in the `code` field. */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'CONFLICT'
  | 'GONE'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'UNPROCESSABLE_ENTITY'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'BAD_GATEWAY'
  | 'SERVICE_UNAVAILABLE'
  | 'GATEWAY_TIMEOUT'
  | 'VALIDATION_ERROR'
  | `HTTP_${number}`;

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  410: 'GONE',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
  504: 'GATEWAY_TIMEOUT',
};

/** Map an HTTP status to its stable error code (falls back to `HTTP_<status>`). */
export function statusCodeToErrorCode(status: number): ErrorCode {
  return STATUS_TO_CODE[status] ?? `HTTP_${status}`;
}

/** Canonical error envelope returned by every error path. */
export interface ErrorResponse {
  success: false;
  statusCode: number;
  /** Stable machine-readable error code, e.g. `VALIDATION_ERROR`. */
  code: ErrorCode;
  /** Human-readable (localised) message. */
  message: string;
  /** Structured, error-type-specific payload (validation entries, field errors, …). */
  details?: unknown;
  /** Correlates with the `x-trace-id` response header; `null` when tracing is unavailable. */
  traceId: string | null;
  timestamp: string;
  path: string;
  language: string;
}

export interface BuildErrorResponseInput {
  statusCode: number;
  code?: ErrorCode;
  message: string;
  details?: unknown;
  traceId?: string | null;
  path: string;
  language: string;
  /**
   * Legacy fields kept for backward compatibility (e.g. `errors`, dev-only
   * `stack`/`prismaCode`). They are appended after the canonical block;
   * `undefined` values are dropped so the serialised key set stays stable.
   */
  legacy?: Record<string, unknown>;
}

/**
 * Build the canonical error envelope. The only supported way for filters and
 * interceptors to serialise error responses.
 */
export function buildErrorResponse(input: BuildErrorResponseInput): ErrorResponse {
  const envelope: ErrorResponse = {
    success: false,
    statusCode: input.statusCode,
    code: input.code ?? statusCodeToErrorCode(input.statusCode),
    message: input.message,
    traceId: input.traceId ?? null,
    timestamp: new Date().toISOString(),
    path: input.path,
    language: input.language,
  };

  if (input.details !== undefined) {
    envelope.details = input.details;
  }

  if (input.legacy) {
    for (const [key, value] of Object.entries(input.legacy)) {
      if (value !== undefined) {
        (envelope as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }

  return envelope;
}

interface TraceableRequestShape {
  traceId?: unknown;
  headers?: Record<string, unknown>;
}

/**
 * Extract the trace id from a request. Prefers `request.traceId` (set by the
 * TraceInterceptor) and falls back to the `x-trace-id` header so filters keep
 * working even when the interceptor did not run (e.g. guard-level errors in
 * isolated test bootstraps).
 */
export function extractTraceId(request: unknown): string | null {
  if (!request || typeof request !== 'object') return null;
  const req = request as TraceableRequestShape;
  if (typeof req.traceId === 'string' && req.traceId.length > 0) return req.traceId;
  const header = req.headers?.['x-trace-id'];
  if (typeof header === 'string' && header.length > 0) return header;
  if (Array.isArray(header) && typeof header[0] === 'string' && header[0].length > 0) {
    return header[0];
  }
  return null;
}
