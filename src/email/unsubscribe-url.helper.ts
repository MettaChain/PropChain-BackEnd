/**
 * Unsubscribe URL helper
 * Issue #1054 - Email unsubscribe links must not fall back to localhost.
 * FRONTEND_URL must be set in production; throw if missing.
 */
export function buildUnsubscribeUrl(token: string, frontendUrl?: string): string {
  const base = frontendUrl ?? process.env.FRONTEND_URL;
  if (!base) {
    throw new Error(
      'FRONTEND_URL environment variable is not set. ' +
        'Cannot generate unsubscribe link without a valid base URL.',
    );
  }
  const trimmed = base.replace(/\/+$/, '');
  return `${trimmed}/unsubscribe?token=${encodeURIComponent(token)}`;
}
