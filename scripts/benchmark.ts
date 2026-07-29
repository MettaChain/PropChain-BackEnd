// @ts-nocheck

/**
 * Performance Benchmark Suite for PropChain API Endpoints (#946)
 *
 * Benchmarks the 10 most-used endpoints and records p50/p95/p99 latencies.
 * Performance budget: p95 < 500ms for list endpoints, p95 < 200ms for detail endpoints.
 *
 * Usage: npx ts-node scripts/benchmark.ts [--base-url=http://localhost:3000] [--iterations=100]
 */

const BASE_URL = process.env.BENCHMARK_BASE_URL || 'http://localhost:3000/api';
const ITERATIONS = parseInt(process.env.BENCHMARK_ITERATIONS || '100', 10);
const WARMUP_ROUNDS = 5;

interface BenchmarkResult {
  endpoint: string;
  method: string;
  category: 'list' | 'detail' | 'search';
  latencyMs: { p50: number; p95: number; p99: number; max: number; avg: number };
  statusCodes: Record<number, number>;
  passed: boolean;
  budgetMs: number;
}

interface BenchmarkReport {
  timestamp: string;
  baseUrl: string;
  iterations: number;
  results: BenchmarkResult[];
  summary: { total: number; passed: number; failed: number };
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function benchmarkEndpoint(
  name: string,
  method: string,
  path: string,
  category: 'list' | 'detail' | 'search',
  budgetMs: number,
): Promise<BenchmarkResult> {
  const latencies: number[] = [];
  const statusCodes: Record<number, number> = {};

  // Warmup
  for (let i = 0; i < WARMUP_ROUNDS; i++) {
    try {
      await fetch(`${BASE_URL}${path}`, { method });
    } catch {
      // ignore warmup errors
    }
  }

  // Benchmark
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    try {
      const res = await fetch(`${BASE_URL}${path}`, { method });
      const elapsed = performance.now() - start;
      latencies.push(elapsed);
      const status = res.status;
      statusCodes[status] = (statusCodes[status] || 0) + 1;
    } catch {
      const elapsed = performance.now() - start;
      latencies.push(elapsed);
      statusCodes[0] = (statusCodes[0] || 0) + 1;
    }
  }

  latencies.sort((a, b) => a - b);

  const p50 = Math.round(percentile(latencies, 50) * 100) / 100;
  const p95 = Math.round(percentile(latencies, 95) * 100) / 100;
  const p99 = Math.round(percentile(latencies, 99) * 100) / 100;
  const max = Math.round(latencies[latencies.length - 1] * 100) / 100;
  const avg = Math.round((latencies.reduce((a, b) => a + b, 0) / latencies.length) * 100) / 100;

  const passed = p95 < budgetMs;

  return {
    endpoint: `${name} (${method} ${path})`,
    method,
    category,
    latencyMs: { p50, p95, p99, max, avg },
    statusCodes,
    passed,
    budgetMs,
  };
}

async function runBenchmark(): Promise<BenchmarkReport> {
  console.log(`\n  PropChain API Benchmark Suite`);
  console.log(`  Base URL: ${BASE_URL}`);
  console.log(`  Iterations: ${ITERATIONS} (warmup: ${WARMUP_ROUNDS})\n`);

  const endpoints = [
    {
      name: 'Properties List',
      method: 'GET',
      path: '/properties?limit=20',
      category: 'list' as const,
      budget: 500,
    },
    {
      name: 'Property Detail',
      method: 'GET',
      path: '/properties/test-id',
      category: 'detail' as const,
      budget: 200,
    },
    {
      name: 'Transactions List',
      method: 'GET',
      path: '/transactions?limit=20',
      category: 'list' as const,
      budget: 500,
    },
    {
      name: 'Transaction Detail',
      method: 'GET',
      path: '/transactions/test-id',
      category: 'detail' as const,
      budget: 200,
    },
    {
      name: 'Search Properties',
      method: 'GET',
      path: '/search?q=apartment',
      category: 'search' as const,
      budget: 500,
    },
    {
      name: 'User Profile (me)',
      method: 'GET',
      path: '/auth/me',
      category: 'detail' as const,
      budget: 200,
    },
    {
      name: 'List API Keys',
      method: 'GET',
      path: '/auth/api-keys',
      category: 'list' as const,
      budget: 500,
    },
    {
      name: 'Dashboard Stats',
      method: 'GET',
      path: '/admin/dashboard',
      category: 'detail' as const,
      budget: 200,
    },
    {
      name: 'Email Reputation',
      method: 'GET',
      path: '/email/reputation',
      category: 'detail' as const,
      budget: 200,
    },
    {
      name: 'Queue Metrics',
      method: 'GET',
      path: '/admin/queues/metrics',
      category: 'detail' as const,
      budget: 200,
    },
  ];

  const results: BenchmarkResult[] = [];

  for (const ep of endpoints) {
    process.stdout.write(`  Benchmarking: ${ep.name} ... `);
    const result = await benchmarkEndpoint(ep.name, ep.method, ep.path, ep.category, ep.budget);
    results.push(result);
    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`${status} (p95=${result.latencyMs.p95}ms, budget=${result.budgetMs}ms)`);
  }

  const passed = results.filter((r) => r.passed).length;

  const report: BenchmarkReport = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    iterations: ITERATIONS,
    results,
    summary: { total: results.length, passed, failed: results.length - passed },
  };

  console.log(`\n  Summary: ${passed}/${results.length} passed\n`);

  if (results.some((r) => !r.passed)) {
    console.log('  Failed benchmarks:');
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`    - ${r.endpoint}: p95=${r.latencyMs.p95}ms > budget=${r.budgetMs}ms`);
    }
    console.log('');
  }

  return report;
}

async function main() {
  const report = await runBenchmark();
  const outputPath = 'benchmark-results.json';
  const fs = require('fs');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`  Results written to ${outputPath}\n`);
  process.exit(report.summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
