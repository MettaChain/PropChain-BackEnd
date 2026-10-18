import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentService } from './payment.service';

describe('PaymentService', () => {
  let service: PaymentService;

  beforeEach(() => {
    service = new PaymentService();
  });

  it('creates a completed payment and makes it retrievable', () => {
    const payment = service.create({
      amount: 100,
      currency: 'USD',
      reference: 'ref-1',
    });

    expect(payment.id).toBeDefined();
    expect(payment.amount).toBe(100);
    expect(payment.status).toBe('completed');
    expect(service.findOne(payment.id)).toEqual(payment);
  });

  it('rejects a non-positive amount', () => {
    expect(() =>
      service.create({ amount: 0, currency: 'USD', reference: 'ref-2' }),
    ).toThrow(BadRequestException);
  });

  it('rejects a duplicate reference', () => {
    service.create({ amount: 50, currency: 'USD', reference: 'dup' });
    expect(() =>
      service.create({ amount: 75, currency: 'USD', reference: 'dup' }),
    ).toThrow(BadRequestException);
  });

  it('throws NotFound for an unknown id', () => {
    expect(() => service.findOne('missing')).toThrow(NotFoundException);
  });
});
