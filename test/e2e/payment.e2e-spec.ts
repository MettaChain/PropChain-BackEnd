import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PaymentModule } from '../../src/payment/payment.module';

describe('PaymentController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PaymentModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /payments creates a payment', async () => {
    const res = await request(app.getHttpServer())
      .post('/payments')
      .send({ amount: 250, currency: 'USD', reference: 'e2e-1' })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.amount).toBe(250);
    expect(res.body.status).toBe('completed');
  });

  it('POST /payments rejects an invalid amount with 400', async () => {
    await request(app.getHttpServer())
      .post('/payments')
      .send({ amount: -5, currency: 'USD', reference: 'e2e-2' })
      .expect(400);
  });

  it('GET /payments/:id returns 404 for an unknown id', async () => {
    await request(app.getHttpServer())
      .get('/payments/does-not-exist')
      .expect(404);
  });
});
