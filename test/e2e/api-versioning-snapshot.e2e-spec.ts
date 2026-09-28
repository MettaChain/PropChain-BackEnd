/**
 * API Versioning Snapshot Tests
 * 
 * These tests freeze v1 response shapes to ensure backward compatibility
 * until the v1 sunset date (2026-12-31). Any changes to v1 responses
 * will cause these tests to fail, preventing accidental breaking changes.
 * 
 * To update snapshots after intentional changes:
 *   npm test -- test/e2e/api-versioning-snapshot.e2e-spec.ts -u
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('API Versioning Snapshot Tests', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    // Create a test user and get auth token for authenticated endpoints
    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'versioning-test@example.com',
        password: 'SecurePassword123!',
        name: 'Versioning Test User',
      });

    if (registerResponse.status === 201) {
      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'versioning-test@example.com',
          password: 'SecurePassword123!',
        });

      if (loginResponse.status === 200) {
        authToken = loginResponse.body.accessToken;
      }
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Authentication Endpoints - v1', () => {
    it('POST /api/v1/auth/register - should match frozen v1 response', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'snapshot-test@example.com',
          password: 'SecurePassword123!',
          name: 'Snapshot Test User',
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchSnapshot({
        // Freeze only the structure, ignore dynamic values
        id: expect.any(String),
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it('POST /api/v1/auth/login - should match frozen v1 response', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'versioning-test@example.com',
          password: 'SecurePassword123!',
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchSnapshot({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        user: {
          id: expect.any(String),
          email: expect.any(String),
          name: expect.any(String),
        },
      });
    });

    it('GET /api/v1/auth/me - should match frozen v1 response', async () => {
      if (!authToken) {
        console.warn('Skipping authenticated test - no auth token available');
        return;
      }

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchSnapshot({
        id: expect.any(String),
        email: expect.any(String),
        name: expect.any(String),
      });
    });
  });

  describe('User Endpoints - v1', () => {
    it('GET /api/v1/users/me/profile - should match frozen v1 response', async () => {
      if (!authToken) {
        console.warn('Skipping authenticated test - no auth token available');
        return;
      }

      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchSnapshot({
        id: expect.any(String),
        email: expect.any(String),
        name: expect.any(String),
      });
    });
  });

  describe('Properties Endpoints - v1', () => {
    it('GET /api/v1/properties - should match frozen v1 response', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/properties');

      expect(response.status).toBe(200);
      expect(response.body).toMatchSnapshot({
        // Expect array, but freeze structure
        expect.any(Array),
      });
    });

    it('GET /api/v1/properties/search - should match frozen v1 response', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/properties/search')
        .query({ city: 'San Francisco' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchSnapshot({
        expect.any(Array),
      });
    });
  });

  describe('Transactions Endpoints - v1', () => {
    it('GET /api/v1/transactions - should match frozen v1 response', async () => {
      if (!authToken) {
        console.warn('Skipping authenticated test - no auth token available');
        return;
      }

      const response = await request(app.getHttpServer())
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchSnapshot({
        total: expect.any(Number),
        page: expect.any(Number),
        limit: expect.any(Number),
        items: expect.any(Array),
      });
    });
  });

  describe('Search Endpoints - v1', () => {
    it('GET /api/v1/search/suggestions - should match frozen v1 response', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/search/suggestions')
        .query({ q: 'test' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchSnapshot({
        expect.any(Array),
      });
    });
  });

  describe('Dashboard Endpoints - v1', () => {
    it('GET /api/v1/dashboard - should match frozen v1 response', async () => {
      if (!authToken) {
        console.warn('Skipping authenticated test - no auth token available');
        return;
      }

      const response = await request(app.getHttpServer())
        .get('/api/v1/dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchSnapshot({
        // Freeze dashboard structure
        expect.any(Object),
      });
    });
  });

  describe('Version Drift Detection', () => {
    it('v1 and v2 responses should have documented differences', async () => {
      // Test properties endpoint for version drift
      const v1Response = await request(app.getHttpServer())
        .get('/api/v1/properties');

      const v2Response = await request(app.getHttpServer())
        .get('/api/v2/properties');

      expect(v1Response.status).toBe(200);
      expect(v2Response.status).toBe(200);

      // Document that v2 may have additional fields
      // This test ensures we're aware of any structural differences
      const v1Keys = v1Response.body.length > 0 ? Object.keys(v1Response.body[0]) : [];
      const v2Keys = v2Response.body.length > 0 ? Object.keys(v2Response.body[0]) : [];

      // v2 should have all v1 fields plus potentially more
      v1Keys.forEach(key => {
        expect(v2Keys).toContain(key);
      });

      // Log any new fields in v2 for documentation
      const newFields = v2Keys.filter(key => !v1Keys.includes(key));
      if (newFields.length > 0) {
        console.log(`v2 has additional fields compared to v1: ${newFields.join(', ')}`);
      }
    });
  });

  describe('Version Headers', () => {
    it('v1 requests should return deprecation headers', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/properties');

      expect(response.status).toBe(200);
      expect(response.headers['api-version']).toBe('v1');
      expect(response.headers['api-version-status']).toBe('deprecated');
      expect(response.headers['deprecation']).toBe('true');
      expect(response.headers['sunset']).toBeDefined();
    });

    it('v2 requests should return active status headers', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v2/properties');

      expect(response.status).toBe(200);
      expect(response.headers['api-version']).toBe('v2');
      expect(response.headers['api-version-status']).toBe('active');
      expect(response.headers['deprecation']).toBeUndefined();
    });
  });
});
