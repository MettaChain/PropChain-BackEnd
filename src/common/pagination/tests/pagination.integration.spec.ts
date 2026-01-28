import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaginationModule } from '../pagination.module';

// Mock User Entity
class User {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
}

describe('Pagination Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [User],
          synchronize: true,
        }),
        PaginationModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      transform: true,
      whitelist: true,
    }));

    await app.init();

    // Seed test data
    await seedTestData(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /users (paginated endpoint)', () => {
    it('should return first page with default pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta.page).toBe(1);
      expect(response.body.meta.limit).toBe(10);
      expect(response.body.data).toHaveLength(10);
    });

    it('should return specified page', async () => {
      const response = await request(app.getHttpServer())
        .get('/users?page=2&limit=10')
        .expect(200);

      expect(response.body.meta.page).toBe(2);
      expect(response.body.meta.hasPrev).toBe(true);
    });

    it('should respect custom limit', async () => {
      const response = await request(app.getHttpServer())
        .get('/users?limit=5')
        .expect(200);

      expect(response.body.data).toHaveLength(5);
      expect(response.body.meta.limit).toBe(5);
    });

    it('should handle last page correctly', async () => {
      const response = await request(app.getHttpServer())
        .get('/users?page=10&limit=10')
        .expect(200);

      expect(response.body.meta.hasNext).toBe(false);
      expect(response.body.meta.hasPrev).toBe(true);
    });

    it('should validate page parameter', async () => {
      await request(app.getHttpServer())
        .get('/users?page=0')
        .expect(400);

      await request(app.getHttpServer())
        .get('/users?page=-1')
        .expect(400);
    });

    it('should validate limit parameter', async () => {
      await request(app.getHttpServer())
        .get('/users?limit=0')
        .expect(400);

      await request(app.getHttpServer())
        .get('/users?limit=101')
        .expect(400);
    });

    it('should handle sorting', async () => {
      const response = await request(app.getHttpServer())
        .get('/users?sortBy=name&sortOrder=ASC')
        .expect(200);

      expect(response.body.data).toBeDefined();

      // Verify sorting
      const names = response.body.data.map(u => u.name);
      const sortedNames = [...names].sort();
      expect(names).toEqual(sortedNames);
    });

    it('should return correct metadata', async () => {
      const response = await request(app.getHttpServer())
        .get('/users?page=2&limit=10')
        .expect(200);

      expect(response.body.meta).toMatchObject({
        page: 2,
        limit: 10,
        total: expect.any(Number),
        pages: expect.any(Number),
        hasNext: expect.any(Boolean),
        hasPrev: true,
      });
    });

    it('should handle empty results', async () => {
      const response = await request(app.getHttpServer())
        .get('/users?page=1000')
        .expect(200);

      expect(response.body.data).toEqual([]);
      expect(response.body.meta.hasNext).toBe(false);
    });

    it('should navigate through all pages', async () => {
      const firstPage = await request(app.getHttpServer())
        .get('/users?page=1&limit=10')
        .expect(200);

      const totalPages = firstPage.body.meta.pages;

      for (let page = 1; page <= totalPages; page++) {
        const response = await request(app.getHttpServer())
          .get(`/users?page=${page}&limit=10`)
          .expect(200);

        expect(response.body.meta.page).toBe(page);
        expect(response.body.meta.hasPrev).toBe(page > 1);
        expect(response.body.meta.hasNext).toBe(page < totalPages);
      }
    });

    it('should maintain data integrity across pages', async () => {
      const allIds = new Set();
      const limit = 10;

      const firstPage = await request(app.getHttpServer())
        .get(`/users?page=1&limit=${limit}`)
        .expect(200);

      const totalPages = firstPage.body.meta.pages;

      for (let page = 1; page <= totalPages; page++) {
        const response = await request(app.getHttpServer())
          .get(`/users?page=${page}&limit=${limit}`)
          .expect(200);

        response.body.data.forEach(item => {
          expect(allIds.has(item.id)).toBe(false); // No duplicates
          allIds.add(item.id);
        });
      }

      expect(allIds.size).toBe(firstPage.body.meta.total);
    });
  });
});

async function seedTestData(app: INestApplication) {
  // Add logic to seed your database with test data
  // Example: Create 100 users for testing
  const userRepository = app.get('UserRepository');

  const users = [];
  for (let i = 1; i <= 100; i++) {
    users.push({
      name: `User ${i}`,
      email: `user${i}@example.com`,
      createdAt: new Date(Date.now() - i * 1000 * 60 * 60),
    });
  }

  await userRepository.save(users);
}
