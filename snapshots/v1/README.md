# v1 API Response Snapshots

This directory contains frozen v1 API response snapshots for drift detection.

## Purpose

These snapshots ensure that v1 API responses remain stable until the v1 sunset date (2026-12-31). Any changes to v1 response structures will cause the drift detection script to fail, preventing accidental breaking changes.

## How It Works

1. The `scripts/version-drift-detection.ts` script compares current v1 responses against these snapshots
2. If drift is detected, CI fails and developers must either:
   - Revert the changes that caused drift
   - Intentionally update the snapshot (if the change is planned and documented)

## Updating Snapshots

If you need to intentionally change v1 responses (e.g., documented breaking change):

1. Delete the relevant snapshot file(s)
2. Run the drift detection script locally: `npm run test:version-drift`
3. Review the new snapshots to ensure they match expectations
4. Commit the new snapshot files
5. Update `docs/API_VERSIONING.md` to document the change

## Files

Each snapshot file corresponds to a specific API endpoint:
- `api_v1_auth_me.json` - GET /api/v1/auth/me
- `api_v1_properties.json` - GET /api/v1/properties
- etc.

## CI Integration

These snapshots are tested in CI via the `version-drift-detection` job in `.github/workflows/ci.yml`.
