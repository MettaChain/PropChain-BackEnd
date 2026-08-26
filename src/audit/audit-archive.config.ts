/**
 * Audit Archive Storage Configuration
 * Issue #1055 - Audit archives must use persistent external storage,
 * not ephemeral local disk, to prevent history loss on redeploy.
 *
 * Recommended: stream archive files to S3-compatible storage.
 * Set AUDIT_ARCHIVE_STORAGE=s3 and AUDIT_ARCHIVE_BUCKET=<bucket-name>.
 */
export const AUDIT_ARCHIVE_STORAGE = process.env.AUDIT_ARCHIVE_STORAGE ?? 'local';
export const AUDIT_ARCHIVE_BUCKET = process.env.AUDIT_ARCHIVE_BUCKET ?? '';
export const AUDIT_ARCHIVE_REGION = process.env.AUDIT_ARCHIVE_REGION ?? 'us-east-1';

/** Guard: warn if using local storage in production. */
export function validateAuditStorageConfig(): void {
  if (process.env.NODE_ENV === 'production' && AUDIT_ARCHIVE_STORAGE === 'local') {
    throw new Error(
      'AUDIT_ARCHIVE_STORAGE must not be "local" in production. ' +
      'Set AUDIT_ARCHIVE_STORAGE=s3 and configure AUDIT_ARCHIVE_BUCKET.',
    );
  }
}