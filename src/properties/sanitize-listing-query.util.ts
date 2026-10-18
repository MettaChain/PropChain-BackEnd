import { TransformFnParams } from 'class-transformer';

// Matches C0/C1 control characters (including NUL) except tab/newline, which
// collapse into spaces for free text.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/**
 * Normalise a listing *query* value.
 *
 * Search and bulk filters are echoed back in logs and cache keys, and they are
 * interpolated into `contains` / `has` / `equals` predicates, so they get
 * trimmed and stripped of control characters before anything else looks at them.
 *
 * Unlike the write-path helper, HTML tags are **not** stripped: a listing
 * description legitimately contains `<`, and a search for `"a < b"` must not
 * silently change meaning. Tag stripping belongs where the value is stored and
 * rendered, not where it is used to filter.
 */
export function sanitizeListingQuery(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.normalize('NFKC').replace(CONTROL_CHARS, '').trim();
}

/** class-transformer callback for listing query DTO fields. */
export const TrimListingQuery = ({ value }: TransformFnParams): unknown =>
  sanitizeListingQuery(value);
