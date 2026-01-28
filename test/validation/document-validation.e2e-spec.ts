import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Document Validation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /documents', () => {
    it('should accept valid query parameters', () => {
      return request(app.getHttpServer())
        .get('/documents')
        .set('x-user-id', 'test-user')
        .query({
          type: 'DEED',
          accessLevel: 'PRIVATE',
          tag: 'legal',
          page: 1,
          limit: 20,
        })
        .expect((res) => {
          expect(res.status).not.toBe(400);
        });
    });

    it('should reject invalid document type', () => {
      return request(app.getHttpServer())
        .get('/documents')
        .set('x-user-id', 'test-user')
        .query({
          type: 'INVALID_TYPE',
        })
        .expect(400);
    });

    it('should reject invalid access level', () => {
      return request(app.getHttpServer())
        .get('/documents')
        .set('x-user-id', 'test-user')
        .query({
          accessLevel: 'INVALID',
        })
        .expect(400);
    });

    it('should reject invalid createdAfter date', () => {
      return request(app.getHttpServer())
        .get('/documents')
        .set('x-user-id', 'test-user')
        .query({
          createdAfter: 'invalid-date',
        })
        .expect(400);
    });

    it('should reject non-ISO date format', () => {
      return request(app.getHttpServer())
        .get('/documents')
        .set('x-user-id', 'test-user')
        .query({
          createdAfter: '01/01/2024',
        })
        .expect(400);
    });

    it('should accept valid ISO 8601 date', () => {
      return request(app.getHttpServer())
        .get('/documents')
        .set('x-user-id', 'test-user')
        .query({
          createdAfter: '2024-01-01T00:00:00.000Z',
        })
        .expect((res) => {
          expect(res.status).not.toBe(400);
        });
    });

    it('should reject invalid page number', () => {
      return request(app.getHttpServer())
        .get('/documents')
        .set('x-user-id', 'test-user')
        .query({
          page: 0,
        })
        .expect(400);
    });

    it('should reject limit too high', () => {
      return request(app.getHttpServer())
        .get('/documents')
        .set('x-user-id', 'test-user')
        .query({
          limit: 101,
        })
        .expect(400);
    });
  });

  describe('GET /documents/:id/download', () => {
    it('should accept valid version number', () => {
      return request(app.getHttpServer())
        .get('/documents/test-id/download')
        .set('x-user-id', 'test-user')
        .query({
          version: 1,
        })
        .expect((res) => {
          expect(res.status).not.toBe(400);
        });
    });

    it('should reject version less than 1', () => {
      return request(app.getHttpServer())
        .get('/documents/test-id/download')
        .set('x-user-id', 'test-user')
        .query({
          version: 0,
        })
        .expect(400);
    });

    it('should reject negative version', () => {
      return request(app.getHttpServer())
        .get('/documents/test-id/download')
        .set('x-user-id', 'test-user')
        .query({
          version: -1,
        })
        .expect(400);
    });
  });

  describe('PATCH /documents/:id/metadata', () => {
    it('should reject invalid document type', () => {
      return request(app.getHttpServer())
        .patch('/documents/test-id/metadata')
        .set('x-user-id', 'test-user')
        .send({
          type: 'INVALID_TYPE',
        })
        .expect(400);
    });

    it('should reject invalid access level', () => {
      return request(app.getHttpServer())
        .patch('/documents/test-id/metadata')
        .set('x-user-id', 'test-user')
        .send({
          accessLevel: 'INVALID',
        })
        .expect(400);
    });

    it('should reject title too long', () => {
      return request(app.getHttpServer())
        .patch('/documents/test-id/metadata')
        .set('x-user-id', 'test-user')
        .send({
          title: 'A'.repeat(201),
        })
        .expect(400);
    });

    it('should reject description too long', () => {
      return request(app.getHttpServer())
        .patch('/documents/test-id/metadata')
        .set('x-user-id', 'test-user')
        .send({
          description: 'A'.repeat(1001),
        })
        .expect(400);
    });

    it('should accept valid metadata update', () => {
      return request(app.getHttpServer())
        .patch('/documents/test-id/metadata')
        .set('x-user-id', 'test-user')
        .send({
          title: 'Updated Title',
          accessLevel: 'PUBLIC',
        })
        .expect((res) => {
          expect(res.status).not.toBe(400);
        });
    });

    it('should accept all valid document types', async () => {
      const validTypes = ['DEED', 'INSPECTION_REPORT', 'PHOTO', 'OTHER'];
      for (const type of validTypes) {
        const res = await request(app.getHttpServer())
          .patch('/documents/test-id/metadata')
          .set('x-user-id', 'test-user')
          .send({ type });
        expect(res.status).not.toBe(400);
      }
    });

    it('should accept all valid access levels', async () => {
      const validLevels = ['PRIVATE', 'RESTRICTED', 'PUBLIC'];
      for (const accessLevel of validLevels) {
        const res = await request(app.getHttpServer())
          .patch('/documents/test-id/metadata')
          .set('x-user-id', 'test-user')
          .send({ accessLevel });
        expect(res.status).not.toBe(400);
      }
    });
  });
});
