/**
 * API Version Drift Detection Script
 * 
 * This script compares v1 and v2 API responses to detect drift.
 * It should be run in CI to ensure v1 responses remain stable
 * until the sunset date (2026-12-31).
 * 
 * Usage:
 *   ts-node scripts/version-drift-detection.ts
 * 
 * Exit codes:
 *   0: No drift detected
 *   1: Drift detected - v1 responses have changed
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

interface DriftReport {
  endpoint: string;
  v1Status: number;
  v2Status: number;
  hasDrift: boolean;
  driftDetails: string[];
}

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const SNAPSHOT_DIR = path.join(__dirname, '..', 'snapshots', 'v1');

// Ensure snapshot directory exists
if (!fs.existsSync(SNAPSHOT_DIR)) {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

/**
 * Key endpoints to monitor for drift
 */
const ENDPOINTS_TO_MONITOR = [
  { method: 'GET', path: '/api/v1/auth/me', requiresAuth: true },
  { method: 'GET', path: '/api/v1/users/me/profile', requiresAuth: true },
  { method: 'GET', path: '/api/v1/properties', requiresAuth: false },
  { method: 'GET', path: '/api/v1/properties/search?city=San Francisco', requiresAuth: false },
  { method: 'GET', path: '/api/v1/transactions', requiresAuth: true },
  { method: 'GET', path: '/api/v1/search/suggestions?q=test', requiresAuth: false },
  { method: 'GET', path: '/api/v1/dashboard', requiresAuth: true },
];

/**
 * Compare two objects for structural differences
 */
function compareStructure(obj1: any, obj2: any, path: string = ''): string[] {
  const differences: string[] = [];

  if (obj1 === null || obj2 === null) {
    if (obj1 !== obj2) {
      differences.push(`${path}: null mismatch (${obj1} vs ${obj2})`);
    }
    return differences;
  }

  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
    if (obj1 !== obj2) {
      differences.push(`${path}: value mismatch (${obj1} vs ${obj2})`);
    }
    return differences;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  // Check for missing keys in v1
  keys2.forEach(key => {
    if (!keys1.includes(key)) {
      differences.push(`${path}.${key}: field exists in v2 but not in v1 (potential breaking change)`);
    }
  });

  // Check for new keys in v1 (should not happen after freezing)
  keys1.forEach(key => {
    if (!keys2.includes(key)) {
      differences.push(`${path}.${key}: field exists in v1 but not in v2 (unexpected)`);
    }
  });

  // Recursively compare shared keys
  keys1.filter(key => keys2.includes(key)).forEach(key => {
    const newPath = path ? `${path}.${key}` : key;
    differences.push(...compareStructure(obj1[key], obj2[key], newPath));
  });

  return differences;
}

/**
 * Load stored v1 snapshot for an endpoint
 */
function loadV1Snapshot(endpoint: string): any | null {
  const snapshotPath = path.join(SNAPSHOT_DIR, `${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
  
  if (!fs.existsSync(snapshotPath)) {
    return null;
  }

  try {
    const snapshotData = fs.readFileSync(snapshotPath, 'utf-8');
    return JSON.parse(snapshotData);
  } catch (error) {
    console.error(`Failed to load snapshot for ${endpoint}:`, error);
    return null;
  }
}

/**
 * Save v1 response as snapshot
 */
function saveV1Snapshot(endpoint: string, response: any): void {
  const snapshotPath = path.join(SNAPSHOT_DIR, `${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
  
  try {
    fs.writeFileSync(snapshotPath, JSON.stringify(response, null, 2));
  } catch (error) {
    console.error(`Failed to save snapshot for ${endpoint}:`, error);
  }
}

/**
 * Test a single endpoint for drift
 */
async function testEndpoint(endpoint: { method: string; path: string; requiresAuth: boolean }): Promise<DriftReport> {
  const report: DriftReport = {
    endpoint: endpoint.path,
    v1Status: 0,
    v2Status: 0,
    hasDrift: false,
    driftDetails: [],
  };

  try {
    // Get v1 response
    const v1Response = await axios({
      method: endpoint.method,
      url: `${BASE_URL}${endpoint.path}`,
      headers: endpoint.requiresAuth ? { 
        Authorization: `Bearer ${process.env.TEST_AUTH_TOKEN}` 
      } : {},
    });

    report.v1Status = v1Response.status;

    // Get v2 response (convert v1 path to v2)
    const v2Path = endpoint.path.replace('/api/v1/', '/api/v2/');
    const v2Response = await axios({
      method: endpoint.method,
      url: `${BASE_URL}${v2Path}`,
      headers: endpoint.requiresAuth ? { 
        Authorization: `Bearer ${process.env.TEST_AUTH_TOKEN}` 
      } : {},
    });

    report.v2Status = v2Response.status;

    // Load existing snapshot
    const existingSnapshot = loadV1Snapshot(endpoint.path);

    if (existingSnapshot) {
      // Compare current v1 response with stored snapshot
      const snapshotDifferences = compareStructure(v1Response.data, existingSnapshot);
      
      if (snapshotDifferences.length > 0) {
        report.hasDrift = true;
        report.driftDetails.push(...snapshotDifferences.map(d => `Snapshot drift: ${d}`));
      }
    } else {
      // No snapshot exists, create one
      console.log(`Creating initial snapshot for ${endpoint.path}`);
      saveV1Snapshot(endpoint.path, v1Response.data);
    }

    // Compare v1 and v2 structure
    const versionDifferences = compareStructure(v1Response.data, v2Response.data);
    
    if (versionDifferences.length > 0) {
      // Note: v2 having additional fields is expected and not a problem
      // v1 having fields that v2 doesn't have would be a problem
      const breakingChanges = versionDifferences.filter(d => d.includes('v1 but not in v2'));
      
      if (breakingChanges.length > 0) {
        report.hasDrift = true;
        report.driftDetails.push(...breakingChanges.map(d => `Breaking change: ${d}`));
      }
    }

  } catch (error) {
    if (axios.isAxiosError(error)) {
      report.v1Status = error.response?.status || 0;
      report.driftDetails.push(`Request failed: ${error.message}`);
    } else {
      report.driftDetails.push(`Unexpected error: ${error}`);
    }
    report.hasDrift = true;
  }

  return report;
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Starting API Version Drift Detection');
  console.log(`📍 Base URL: ${BASE_URL}`);
  console.log(`📁 Snapshot Directory: ${SNAPSHOT_DIR}`);
  console.log('');

  const reports: DriftReport[] = [];
  let hasAnyDrift = false;

  for (const endpoint of ENDPOINTS_TO_MONITOR) {
    console.log(`Testing ${endpoint.method} ${endpoint.path}...`);
    const report = await testEndpoint(endpoint);
    reports.push(report);

    if (report.hasDrift) {
      hasAnyDrift = true;
      console.log(`  ❌ DRIFT DETECTED`);
      report.driftDetails.forEach(detail => console.log(`     - ${detail}`));
    } else {
      console.log(`  ✅ No drift`);
    }
    console.log('');
  }

  // Print summary
  console.log('📊 Summary:');
  console.log(`  Total endpoints tested: ${reports.length}`);
  console.log(`  Endpoints with drift: ${reports.filter(r => r.hasDrift).length}`);
  console.log(`  Endpoints stable: ${reports.filter(r => !r.hasDrift).length}`);

  if (hasAnyDrift) {
    console.log('');
    console.log('❌ DRIFT DETECTED - v1 responses have changed!');
    console.log('');
    console.log('To update snapshots after intentional changes:');
    console.log('  1. Review the drift details above');
    console.log('  2. If changes are intentional, delete the old snapshot files');
    console.log('  3. Run this script again to create new snapshots');
    console.log('  4. Commit the new snapshot files to version control');
    console.log('');
    console.log('If changes are unintentional:');
    console.log('  1. Revert the changes that caused the drift');
    console.log('  2. Ensure new fields are only added to v2 responses');
    console.log('  3. Use @ApiVersion decorator for version-specific behavior');
    process.exit(1);
  } else {
    console.log('');
    console.log('✅ No drift detected - v1 responses are stable');
    process.exit(0);
  }
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
