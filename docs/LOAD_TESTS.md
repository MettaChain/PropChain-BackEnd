# Load Testing Documentation

## Overview

This document outlines the load testing strategy for the PropChain Backend application, a NestJS-based system using Prisma for database management. Load testing ensures the application can handle expected and peak loads while maintaining performance and reliability.

## Acceptance Criteria

The load testing implementation must include:

- **Stress Tests**: Tests that push the system beyond normal operational capacity to determine breaking points and failure modes.
- **Concurrency Tests**: Tests that simulate multiple users accessing the system simultaneously to identify race conditions and synchronization issues.
- **Bottleneck Identification**: Analysis to pinpoint performance bottlenecks in the application, database, or infrastructure.
- **Reports**: Comprehensive documentation of test results, metrics, and recommendations.

## Testing Tools

### Recommended Tools

- **Artillery**: Modern load testing toolkit for HTTP, WebSocket, and Socket.io
- **k6**: Developer-centric load testing tool with scripting capabilities
- **JMeter**: Mature load testing tool with extensive reporting features
- **Locust**: Python-based load testing framework

For this implementation, we'll use **k6** due to its:
- JavaScript/TypeScript support (aligns with NestJS)
- Cloud execution capabilities
- Built-in metrics and reporting
- Easy integration with CI/CD pipelines

## Test Scenarios

### 1. Authentication Load Tests

**Objective**: Test login, registration, and session management under load.

**Scenarios**:
- Concurrent user logins
- Registration bursts
- Session validation under high traffic
- Rate limiting effectiveness

### 2. Property Management Tests

**Objective**: Test property CRUD operations under various load conditions.

**Scenarios**:
- Bulk property creation
- Concurrent property searches
- Property updates during peak usage
- Image upload handling

### 3. User Management Tests

**Objective**: Test user-related operations including avatar uploads and preferences.

**Scenarios**:
- Avatar upload concurrency
- User preference updates
- Activity logging under load
- User import processes

### 4. Dashboard and Analytics Tests

**Objective**: Test dashboard performance and data aggregation.

**Scenarios**:
- Dashboard data loading
- Trust score calculations
- Analytics queries under load

## Implementation Steps

### 1. Environment Setup

```bash
# Install k6
npm install -g k6

# Or using package managers
# Ubuntu/Debian
sudo apt update
sudo apt install k6

# macOS
brew install k6
```

### 2. Test Script Structure

Create a `load-tests/` directory in the project root with the following structure:

```
load-tests/
├── scripts/
│   ├── auth-tests.js
│   ├── property-tests.js
│   ├── user-tests.js
│   └── dashboard-tests.js
├── scenarios/
│   ├── stress-test.js
│   ├── concurrency-test.js
│   └── bottleneck-analysis.js
├── config/
│   ├── environments.js
│   └── thresholds.js
└── reports/
    └── README.md
```

### 3. Basic Test Script Example

```javascript
// load-tests/scripts/auth-tests.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

export let errorRate = new Rate('errors');
export let loginTrend = new Trend('login_duration');

export let options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp up to 100 users
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 200 }, // Ramp up to 200 users
    { duration: '5m', target: 200 }, // Stay at 200 users
    { duration: '2m', target: 0 },   // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(99)<1500'], // 99% of requests should be below 1.5s
    http_req_failed: ['rate<0.1'],     // Error rate should be below 10%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const loginPayload = {
    email: `user${__VU}@example.com`,
    password: 'password123',
  };

  const response = http.post(`${BASE_URL}/auth/login`, JSON.stringify(loginPayload), {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const checkResult = check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 1000ms': (r) => r.timings.duration < 1000,
  });

  errorRate.add(!checkResult);
  loginTrend.add(response.timings.duration);

  sleep(1);
}
```

### 4. Stress Test Configuration

```javascript
// load-tests/scenarios/stress-test.js
export let options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '2m', target: 50 },
    { duration: '3m', target: 100 },
    { duration: '4m', target: 200 },
    { duration: '5m', target: 500 },
    { duration: '6m', target: 1000 },
    { duration: '7m', target: 1000 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.05'],
  },
};
```

### 5. Concurrency Test Configuration

```javascript
// load-tests/scenarios/concurrency-test.js
export let options = {
  scenarios: {
    constant_request_rate: {
      executor: 'constant-arrival-rate',
      rate: 30, // 30 requests per second
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 50,
      maxVUs: 100,
    },
  },
  thresholds: {
    http_req_duration: ['p(99)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};
```

## Bottleneck Identification

### Database Bottlenecks

- Monitor Prisma query performance
- Check for N+1 query problems
- Analyze database connection pool usage
- Review index effectiveness

### Application Bottlenecks

- CPU and memory usage monitoring
- Response time analysis by endpoint
- Error rate monitoring
- Throughput measurements

### Infrastructure Bottlenecks

- Network latency analysis
- Load balancer performance
- Cache hit rates
- External service dependencies

## Monitoring and Metrics

### Key Metrics to Track

- **Response Time**: Average, median, 95th, 99th percentiles
- **Throughput**: Requests per second
- **Error Rate**: Percentage of failed requests
- **Resource Usage**: CPU, memory, disk I/O
- **Database Performance**: Query execution time, connection count

### Tools Integration

```javascript
// Prometheus metrics export
import { Counter, Gauge, Rate, Trend } from 'k6/metrics';

export let customCounter = new Counter('custom_counter');
export let customGauge = new Gauge('custom_gauge');
export let customRate = new Rate('custom_rate');
export let customTrend = new Trend('custom_trend');
```

## Reporting

### Automated Report Generation

```bash
# Run tests with JSON output
k6 run --out json=results.json script.js

# Generate HTML report
k6 run --out json=results.json script.js
# Use external tools to convert JSON to HTML
```

### Report Contents

Each load test report should include:

1. **Executive Summary**
   - Test objectives and scope
   - Key findings and recommendations

2. **Test Configuration**
   - Environment details
   - Test scenarios and parameters
   - Load patterns used

3. **Performance Metrics**
   - Response times (avg, median, percentiles)
   - Throughput measurements
   - Error rates and types

4. **Bottleneck Analysis**
   - Identified performance bottlenecks
   - Root cause analysis
   - Impact assessment

5. **Recommendations**
   - Performance improvements
   - Infrastructure scaling suggestions
   - Code optimization opportunities

### Sample Report Structure

```markdown
# Load Test Report - [Date]

## Test Summary
- **Test Type**: [Stress/Concurrency/Bottleneck]
- **Duration**: [X minutes]
- **Peak Load**: [X users/requests per second]
- **Environment**: [Development/Staging/Production]

## Key Metrics
| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Avg Response Time | 450ms | <500ms | ✅ |
| 95th Percentile | 1200ms | <1500ms | ✅ |
| Error Rate | 0.5% | <1% | ✅ |
| Throughput | 150 RPS | >100 RPS | ✅ |

## Bottlenecks Identified
1. **Database Query Performance**
   - Issue: Slow property search queries
   - Impact: Increased response times under load
   - Recommendation: Add composite indexes

2. **Memory Usage**
   - Issue: High memory consumption during bulk operations
   - Impact: Potential out-of-memory errors
   - Recommendation: Implement streaming for large datasets

## Recommendations
- Optimize database queries
- Implement caching strategies
- Consider horizontal scaling
- Monitor resource usage in production
```

## CI/CD Integration

### GitHub Actions Example

```yaml
# .github/workflows/load-tests.yml
name: Load Tests
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install k6
        run: |
          sudo apt update
          sudo apt install k6
      - name: Run Load Tests
        run: |
          cd load-tests
          k6 run scripts/auth-tests.js
          k6 run scripts/property-tests.js
      - name: Generate Report
        run: |
          # Generate and upload reports
          echo "Load tests completed"
```

## Best Practices

### Test Data Management

- Use realistic test data
- Avoid production data for testing
- Implement data cleanup between test runs
- Consider data generation tools (Faker.js, etc.)

### Environment Considerations

- Test in environment similar to production
- Use staging environment for comprehensive tests
- Monitor test environment resources
- Isolate test traffic from production

### Continuous Testing

- Run smoke tests regularly
- Include load tests in CI/CD pipeline
- Monitor performance trends over time
- Set up alerts for performance degradation

## Troubleshooting

### Common Issues

1. **High Error Rates**
   - Check application logs
   - Verify test data validity
   - Review rate limiting configurations

2. **Inconsistent Results**
   - Ensure test environment stability
   - Use consistent test data
   - Control external dependencies

3. **Resource Exhaustion**
   - Monitor system resources during tests
   - Scale test infrastructure as needed
   - Implement proper test cleanup

## Conclusion

Implementing comprehensive load testing with stress tests, concurrency tests, bottleneck identification, and detailed reporting is crucial for ensuring the PropChain Backend can handle production loads reliably. Regular execution of these tests, combined with performance monitoring, will help maintain optimal application performance and user experience.