import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ArgumentMetadata } from '@nestjs/common/interfaces';
import { RegisterDto } from '../../src/auth/dto/auth.dto';

describe('RegisterDto validation', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: RegisterDto,
    data: '',
  };

  it('rejects invalid phone numbers', async () => {
    await expect(
      pipe.transform(
        {
          email: 'test@example.com',
          password: 'StrongPass1!',
          firstName: 'John',
          lastName: 'Doe',
          phone: '12345',
        },
        metadata,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts valid phone numbers', async () => {
    const result = await pipe.transform(
      {
        email: 'test@example.com',
        password: 'StrongPass1!',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+15555555555',
      },
      metadata,
    );

    expect(result).toHaveProperty('phone', '+15555555555');
  });
});
