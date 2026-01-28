import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Property Validation (e2e)', () => {
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

  describe('POST /properties', () => {
    const validPropertyData = {
      title: 'Luxury Downtown Apartment',
      price: 500000,
      address: {
        street: '123 Main Street',
        city: 'New York',
        country: 'United States',
      },
    };

    it('should reject empty title', () => {
      return request(app.getHttpServer())
        .post('/properties')
        .send({
          ...validPropertyData,
          title: '',
        })
        .expect(400);
    });

    it('should reject title too long', () => {
      return request(app.getHttpServer())
        .post('/properties')
        .send({
          ...validPropertyData,
          title: 'A'.repeat(201),
        })
        .expect(400);
    });

    it('should reject negative price', () => {
      return request(app.getHttpServer())
        .post('/properties')
        .send({
          ...validPropertyData,
          price: -100,
        })
        .expect(400);
    });

    it('should reject zero price', () => {
      return request(app.getHttpServer())
        .post('/properties')
        .send({
          ...validPropertyData,
          price: 0,
        })
        .expect(400);
    });

    it('should reject invalid nested address', () => {
      return request(app.getHttpServer())
        .post('/properties')
        .send({
          ...validPropertyData,
          address: {
            street: '',
            city: 'New York',
            country: 'United States',
          },
        })
        .expect(400);
    });

    it('should reject missing address fields', () => {
      return request(app.getHttpServer())
        .post('/properties')
        .send({
          ...validPropertyData,
          address: {
            street: '123 Main Street',
          },
        })
        .expect(400);
    });

    it('should reject invalid property type', () => {
      return request(app.getHttpServer())
        .post('/properties')
        .send({
          ...validPropertyData,
          type: 'INVALID_TYPE',
        })
        .expect(400);
    });

    it('should reject invalid property status', () => {
      return request(app.getHttpServer())
        .post('/properties')
        .send({
          ...validPropertyData,
          status: 'INVALID_STATUS',
        })
        .expect(400);
    });

    it('should reject negative bedrooms', () => {
      return request(app.getHttpServer())
        .post('/properties')
        .send({
          ...validPropertyData,
          bedrooms: -1,
        })
        .expect(400);
    });

    it('should reject bedrooms too high', () => {
      return request(app.getHttpServer())
        .post('/properties')
        .send({
          ...validPropertyData,
          bedrooms: 101,
        })
        .expect(400);
    });

    it('should reject too many features', () => {
      return request(app.getHttpServer())
        .post('/properties')
        .send({
          ...validPropertyData,
          features: Array(51).fill('Feature'),
        })
        .expect(400);
    });

    it('should reject extra fields (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .post('/properties')
        .send({
          ...validPropertyData,
          unknownField: 'value',
        })
        .expect(400)
        .expect((res) => {
          expect(JSON.stringify(res.body.message)).toContain('should not exist');
        });
    });

    it('should reject missing required fields', () => {
      return request(app.getHttpServer())
        .post('/properties')
        .send({})
        .expect(400);
    });
  });

  describe('GET /properties', () => {
    it('should accept valid query parameters', () => {
      return request(app.getHttpServer())
        .get('/properties')
        .query({
          page: 1,
          limit: 20,
          type: 'RESIDENTIAL',
          city: 'New York',
          minPrice: 100000,
          maxPrice: 500000,
        })
        .expect((res) => {
          expect(res.status).not.toBe(400);
        });
    });

    it('should reject invalid page number', () => {
      return request(app.getHttpServer())
        .get('/properties')
        .query({
          page: 0,
        })
        .expect(400);
    });

    it('should reject limit too high', () => {
      return request(app.getHttpServer())
        .get('/properties')
        .query({
          limit: 101,
        })
        .expect(400);
    });

    it('should reject invalid property type', () => {
      return request(app.getHttpServer())
        .get('/properties')
        .query({
          type: 'INVALID',
        })
        .expect(400);
    });

    it('should reject negative minPrice', () => {
      return request(app.getHttpServer())
        .get('/properties')
        .query({
          minPrice: -100,
        })
        .expect(400);
    });

    it('should reject invalid sort order', () => {
      return request(app.getHttpServer())
        .get('/properties')
        .query({
          sortOrder: 'invalid',
        })
        .expect(400);
    });
  });

  describe('PATCH /properties/:id', () => {
    it('should reject invalid property type on update', () => {
      return request(app.getHttpServer())
        .patch('/properties/1')
        .send({
          type: 'INVALID_TYPE',
        })
        .expect(400);
    });

    it('should reject negative price on update', () => {
      return request(app.getHttpServer())
        .patch('/properties/1')
        .send({
          price: -100,
        })
        .expect(400);
    });

    it('should reject extra fields on update', () => {
      return request(app.getHttpServer())
        .patch('/properties/1')
        .send({
          unknownField: 'value',
        })
        .expect(400);
    });
  });
});
