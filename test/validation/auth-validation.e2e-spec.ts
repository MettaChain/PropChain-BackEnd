import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Auth Validation (e2e)', () => {
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

  describe('POST /auth/register', () => {
    it('should reject invalid email format', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'invalid-email',
          firstName: 'John',
          lastName: 'Doe',
          password: 'SecureP@ss123',
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('email');
        });
    });

    it('should reject weak password', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          password: 'weak',
        })
        .expect(400);
    });

    it('should reject password without special character', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          password: 'SecurePass123',
        })
        .expect(400);
    });

    it('should reject extra fields (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          password: 'SecureP@ss123',
          isAdmin: true,
        })
        .expect(400)
        .expect((res) => {
          expect(JSON.stringify(res.body.message)).toContain('should not exist');
        });
    });

    it('should reject names with invalid characters', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          firstName: 'John123',
          lastName: 'Doe',
          password: 'SecureP@ss123',
        })
        .expect(400);
    });

    it('should reject invalid wallet address format', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          password: 'SecureP@ss123',
          walletAddress: 'invalid-wallet',
        })
        .expect(400);
    });

    it('should reject missing required fields', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({})
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('should reject empty request body', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({})
        .expect(400);
    });

    it('should reject invalid email format', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'not-an-email',
          password: 'password123',
        })
        .expect(400);
    });
  });

  describe('POST /auth/web3-login', () => {
    it('should reject invalid wallet address', () => {
      return request(app.getHttpServer())
        .post('/auth/web3-login')
        .send({
          walletAddress: 'invalid-address',
          signature: '0xsignature',
        })
        .expect(400);
    });

    it('should reject empty signature', () => {
      return request(app.getHttpServer())
        .post('/auth/web3-login')
        .send({
          walletAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
          signature: '',
        })
        .expect(400);
    });

    it('should reject missing fields', () => {
      return request(app.getHttpServer())
        .post('/auth/web3-login')
        .send({})
        .expect(400);
    });
  });

  describe('POST /auth/refresh-token', () => {
    it('should reject invalid JWT format', () => {
      return request(app.getHttpServer())
        .post('/auth/refresh-token')
        .send({
          refreshToken: 'not-a-jwt',
        })
        .expect(400);
    });

    it('should reject empty refresh token', () => {
      return request(app.getHttpServer())
        .post('/auth/refresh-token')
        .send({
          refreshToken: '',
        })
        .expect(400);
    });

    it('should reject missing refresh token', () => {
      return request(app.getHttpServer())
        .post('/auth/refresh-token')
        .send({})
        .expect(400);
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('should reject invalid email', () => {
      return request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({
          email: 'invalid-email',
        })
        .expect(400);
    });

    it('should reject empty email', () => {
      return request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({
          email: '',
        })
        .expect(400);
    });

    it('should reject missing email', () => {
      return request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({})
        .expect(400);
    });
  });

  describe('PUT /auth/reset-password', () => {
    it('should reject weak password', () => {
      return request(app.getHttpServer())
        .put('/auth/reset-password')
        .send({
          token: 'valid-token',
          newPassword: 'weak',
        })
        .expect(400);
    });

    it('should reject password without uppercase', () => {
      return request(app.getHttpServer())
        .put('/auth/reset-password')
        .send({
          token: 'valid-token',
          newPassword: 'securep@ss123',
        })
        .expect(400);
    });

    it('should reject missing fields', () => {
      return request(app.getHttpServer())
        .put('/auth/reset-password')
        .send({})
        .expect(400);
    });
  });
});
