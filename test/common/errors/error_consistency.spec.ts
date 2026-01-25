import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { AppExceptionFilter } from '../../../src/common/errors/error.filter';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../../src/common/logger/logger.service';

describe('Error Response Consistency (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    const configService = app.get(ConfigService);
    const logger = app.get(LoggerService);
    
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.useGlobalFilters(new AppExceptionFilter(configService, logger));
    
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /non-existent-route should return standardized 404', () => {
    return request(app.getHttpServer())
      .get('/non-existent-route')
      .expect(404)
      .expect((res) => {
        expect(res.body).toHaveProperty('statusCode', 404);
        expect(res.body).toHaveProperty('message');
        expect(res.body).toHaveProperty('code', 'NOT_FOUND');
        expect(res.body).toHaveProperty('timestamp');
        expect(res.body).toHaveProperty('path', '/non-existent-route');
      });
  });

  it('POST /auth/login with invalid data should return standardized 400 validation error', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({}) // Missing required fields
      .expect(400)
      .expect((res) => {
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('code', 'VALIDATION_ERROR');
        expect(res.body).toHaveProperty('details');
        expect(Array.isArray(res.body.details)).toBe(true);
      });
  });
});
