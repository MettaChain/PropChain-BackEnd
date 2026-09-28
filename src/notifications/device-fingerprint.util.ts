import { createHash } from 'crypto';

/**
 * Derive a stable, non-reversible device fingerprint from a user agent
 * (issue #1294). Used to bind a WebSocket ticket to the device that requested
 * it so a stolen ticket cannot be replayed from a different client.
 *
 * The fingerprint is intentionally coarse – it is a defence-in-depth signal,
 * not a replacement for the session-bound ticket.
 */
export function deviceFingerprint(userAgent?: string | null): string {
  const normalized = (userAgent?.trim() || 'unknown').toLowerCase();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}
