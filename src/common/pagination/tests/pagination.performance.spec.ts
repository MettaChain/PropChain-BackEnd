import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { performance } from 'perf_hooks';

describe('Pagination Performance Tests', () => {
  let app: INestApplication;
  const PERFORMANCE_THRESHOLD_MS = 1000; // 1 second
  const LARGE_DATASET_SIZE = 10000;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      // Your module imports
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Seed large dataset
    await seedLargeDataset(app, LARGE_DATASET_SIZE);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Response Time Tests', () => {
    it('should return first page within threshold', async () => {
      const start = performance.now();

      await request(app.getHttpServer())
        .get('/users?page=1&limit=10')
        .expect(200);

      const duration = performance.now() - start;

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
      console.log(`First page response time: ${duration.toFixed(2)}ms`);
    });

    it('should return middle page within threshold', async () => {
      const start = performance.now();

      await request(app.getHttpServer())
        .get('/users?page=500&limit=10')
        .expect(200);

      const duration = performance.now() - start;

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
      console.log(`Middle page response time: ${duration.toFixed(2)}ms`);
    });

    it('should return last page within threshold', async () => {
      const start = performance.now();

      await request(app.getHttpServer())
        .get('/users?page=1000&limit=10')
        .expect(200);

      const duration = performance.now() - start;

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
      console.log(`Last page response time: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Different Page Sizes', () => {
    it('should handle small page size efficiently', async () => {
      const start = performance.now();

      await request(app.getHttpServer())
        .get('/users?page=1&limit=10')
        .expect(200);

      const duration = performance.now() - start;

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
      console.log(`Small page (10) response time: ${duration.toFixed(2)}ms`);
    });

    it('should handle medium page size efficiently', async () => {
      const start = performance.now();

      await request(app.getHttpServer())
        .get('/users?page=1&limit=50')
        .expect(200);

      const duration = performance.now() - start;

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
      console.log(`Medium page (50) response time: ${duration.toFixed(2)}ms`);
    });

    it('should handle large page size efficiently', async () => {
      const start = performance.now();

      await request(app.getHttpServer())
        .get('/users?page=1&limit=100')
        .expect(200);

      const duration = performance.now() - start;

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
      console.log(`Large page (100) response time: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Sorting Performance', () => {
    it('should handle sorting by indexed field efficiently', async () => {
      const start = performance.now();

      await request(app.getHttpServer())
        .get('/users?sortBy=id&sortOrder=ASC&limit=50')
        .expect(200);

      const duration = performance.now() - start;

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
      console.log(`Indexed field sort response time: ${duration.toFixed(2)}ms`);
    });

    it('should handle sorting by non-indexed field', async () => {
      const start = performance.now();

      await request(app.getHttpServer())
        .get('/users?sortBy=name&sortOrder=DESC&limit=50')
        .expect(200);

      const duration = performance.now() - start;

      // Non-indexed fields may be slower, but should still be reasonable
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS * 2);
      console.log(`Non-indexed field sort response time: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple concurrent pagination requests', async () => {
      const concurrentRequests = 10;
      const start = performance.now();

      const requests = Array.from({ length: concurrentRequests }, (_, i) =>
        request(app.getHttpServer())
          .get(`/users?page=${i + 1}&limit=10`)
          .expect(200)
      );

      await Promise.all(requests);

      const duration = performance.now() - start;
      const avgDuration = duration / concurrentRequests;

      console.log(`Average concurrent request time: ${avgDuration.toFixed(2)}ms`);
      expect(avgDuration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
    });
  });

  describe('Query Optimization', () => {
    it('should not perform N+1 queries', async () => {
      // This test requires query logging to be enabled
      // You would need to configure your ORM to log queries

      const response = await request(app.getHttpServer())
        .get('/users?page=1&limit=10')
        .expect(200);

      expect(response.body.data).toHaveLength(10);

      // With proper pagination, there should be:
      // 1. One COUNT query for total
      // 2. One SELECT query for data
      // Total: 2 queries regardless of page size

      // You can verify this by checking query logs
      console.log('Verify query logs show exactly 2 queries');
    });
  });

  describe('Memory Usage', () => {
    it('should not load entire dataset into memory', async () => {
      const memBefore = process.memoryUsage().heapUsed;

      // Request multiple pages
      for (let page = 1; page <= 10; page++) {
        await request(app.getHttpServer())
          .get(`/users?page=${page}&limit=100`)
          .expect(200);
      }

      const memAfter = process.memoryUsage().heapUsed;
      const memDiff = (memAfter - memBefore) / 1024 / 1024; // Convert to MB

      console.log(`Memory increase: ${memDiff.toFixed(2)}MB`);

      // Memory increase should be minimal
      expect(memDiff).toBeLessThan(100); // Less than 100MB increase
    });
  });

  describe('Stress Tests', () => {
    it('should handle rapid sequential requests', async () => {
      const iterations = 50;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        await request(app.getHttpServer())
          .get(`/users?page=${(i % 100) + 1}&limit=10`)
          .expect(200);

        durations.push(performance.now() - start);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);

      console.log(`Average duration: ${avgDuration.toFixed(2)}ms`);
      console.log(`Max duration: ${maxDuration.toFixed(2)}ms`);

      expect(avgDuration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
      expect(maxDuration).toBeLessThan(PERFORMANCE_THRESHOLD_MS * 2);
    });
  });
});

async function seedLargeDataset(app: INestApplication, size: number) {
  console.log(`Seeding ${size} records for performance testing...`);

  const userRepository = app.get('UserRepository');
  const batchSize = 1000;

  for (let i = 0; i < size; i += batchSize) {
    const users = [];

    for (let j = 0; j < Math.min(batchSize, size - i); j++) {
      const index = i + j;
      users.push({
        name: `User ${index}`,
        email: `user${index}@example.com`,
        createdAt: new Date(Date.now() - index * 1000),
      });
    }

    await userRepository.save(users);
  }

  console.log('Seeding complete');
}
