/**
 * API Changelog
 * Tracks all changes, features, and improvements across versions
 */

export interface ChangelogEntry {
  version: string;
  released: string;
  status: 'active' | 'deprecated' | 'sunset';
  sunsetDate?: string;
  features?: string[];
  improvements?: string[];
  bugFixes?: string[];
  breakingChanges?: string[];
  migrationGuide?: string;
  notes?: string;
}

export const API_CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.0.0',
    released: '2026-04-01',
    status: 'active',
    features: [
      'Comprehensive API versioning with backward compatibility',
      'Enhanced user profiles with verification documents',
      'Trust score system for reputation management',
      'Session management with security improvements',
      'User preferences and customization',
      'Soft delete support for data retention',
      'Rate limiting and security headers',
      'Enhanced property search and filters',
      'Email verification system',
      'Two-factor authentication support',
      'API key authentication for server-to-server',
      'Activity logging for audit trails',
    ],
    improvements: [
      'Improved response times with indexed queries',
      'Better error messages and validation',
      'Enhanced security with JWT tokens and refresh tokens',
      'Support for multiple authentication methods',
      'Comprehensive API documentation with Swagger UI',
      'OpenAPI specification for client generation',
      'Interactive API documentation',
      'Code examples for common tasks',
      'Rate limiting information and guidelines',
      'Health check endpoints',
      'Version information endpoints',
      'Endpoint discovery endpoints',
    ],
    breakingChanges: [
      'Some fields now require explicit version headers',
      'Response format changes for enhanced metadata',
      'Authentication token structure updated',
    ],
    migrationGuide: `
      To upgrade from v1 to v2:
      
      1. Update your API endpoint URLs to include version:
         Old: /api/users
         New: /api/v2/users
      
      2. Or use the API-Version header:
         Header: API-Version: v2
      
      3. Update token handling for new refresh token format
      
      4. Review new field additions in responses
      
      5. Implement rate limiting in your client
      
      For detailed migration guide, see /api/changelog
    `,
  },
  {
    version: '1.0.0',
    released: '2026-01-01',
    status: 'deprecated',
    sunsetDate: '2026-12-31',
    features: [
      'User authentication and authorization',
      'Basic user management (CRUD operations)',
      'Property listing and search',
      'Dashboard with analytics',
      'Email verification',
      'Role-based access control',
      'JWT token authentication',
    ],
    improvements: [
      'Initial production release',
      'Comprehensive error handling',
      'Input validation and sanitization',
      'CORS support',
    ],
    notes: 'Deprecated. Please migrate to v2. Support ends 2026-12-31.',
    migrationGuide: `
      This version is deprecated and will be sunset on 2026-12-31.
      
      Action required:
      1. Update your application to use v2
      2. Follow the v2 migration guide
      3. Test thoroughly in staging
      4. Deploy to production before sunset date
      
      Breaking changes in v2:
      - Response format updated
      - Some endpoints renamed
      - Authentication tokens updated
    `,
  },
];

/**
 * Get changelog for a specific version
 */
export function getVersionChangelog(version: string): ChangelogEntry | undefined {
  return API_CHANGELOG.find((entry) => entry.version === version);
}

/**
 * Get all features added since a version
 */
export function getFeaturesAddedSince(version: string): string[] {
  const allFeatures: string[] = [];
  let includeFeatures = false;

  for (const entry of API_CHANGELOG) {
    if (entry.version === version) {
      includeFeatures = true;
      continue;
    }

    if (includeFeatures && entry.features) {
      allFeatures.push(...entry.features);
    }
  }

  return allFeatures;
}

/**
 * Get breaking changes since a version
 */
export function getBreakingChangesSince(version: string): string[] {
  const allChanges: string[] = [];
  let includeChanges = false;

  for (const entry of API_CHANGELOG) {
    if (entry.version === version) {
      includeChanges = true;
      continue;
    }

    if (includeChanges && entry.breakingChanges) {
      allChanges.push(...entry.breakingChanges);
    }
  }

  return allChanges;
}

/**
 * Check if there are critical updates between versions
 */
export function hasCriticalUpdates(fromVersion: string, toVersion: string): boolean {
  const hasBreakingChanges = getBreakingChangesSince(fromVersion).length > 0;
  return hasBreakingChanges;
}
