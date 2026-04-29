import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ArgumentMetadata } from '@nestjs/common/interfaces';
import {
  CreateTransactionDto,
  CreateTransactionTaxStrategyDto,
} from '../../src/transactions/dto/transaction.dto';

describe('CreateTransactionDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: CreateTransactionDto,
    data: '',
  };

  it('rejects missing required fields', async () => {
    await expect(pipe.transform({}, metadata)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid amounts', async () => {
    await expect(
      pipe.transform(
        {
          propertyId: '11111111-1111-4111-8111-111111111111',
          buyerId: '22222222-2222-4222-8222-222222222222',
          sellerId: '33333333-3333-4333-8333-333333333333',
          amount: 0,
        },
        metadata,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('CreateTransactionTaxStrategyDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: CreateTransactionTaxStrategyDto,
    data: '',
  };

  it('rejects missing required fields', async () => {
    await expect(pipe.transform({}, metadata)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects negative tax estimates', async () => {
    await expect(
      pipe.transform(
        {
          strategyType: 'Installment sale timing',
          estimatedTaxImpact: -1,
          explanation: 'Info only',
        },
        metadata,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
