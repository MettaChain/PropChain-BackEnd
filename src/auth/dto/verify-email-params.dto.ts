import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailParamsDto {
  @ApiProperty({
    description: 'Email verification token',
    example: 'verification_token_abc123',
  })
  @IsString({ message: 'Token must be a string' })
  @IsNotEmpty({ message: 'Verification token is required' })
  token: string;
}
