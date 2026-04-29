import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ArgumentMetadata } from '@nestjs/common/interfaces';
import { UpdateTransactionStatusDto } from '../../src/admin/dto/admin.dto';

describe('UpdateTransactionStatusDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: UpdateTransactionStatusDto,
    data: '',
  };

  it('rejects invalid transaction status values', async () => {
    await expect(pipe.transform({ status: 'FAILED' }, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
