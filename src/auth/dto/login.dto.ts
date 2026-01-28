import { IsEmail, IsString, IsNotEmpty, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEthereumAddress } from '../../common/validators';

/**
 * DTO for email/password login
 */
export class LoginEmailDto {
  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'SecureP@ss123',
    minLength: 8,
  })
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  password: string;
}

/**
 * DTO for Web3 wallet login
 */
export class LoginWeb3Dto {
  @ApiProperty({
    description: 'Ethereum wallet address',
    example: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  })
  @IsEthereumAddress({ message: 'Invalid Ethereum wallet address' })
  @IsNotEmpty({ message: 'Wallet address is required' })
  walletAddress: string;

  @ApiProperty({
    description: 'Signature from wallet for authentication',
    example: '0x...',
  })
  @IsString({ message: 'Signature must be a string' })
  @IsNotEmpty({ message: 'Signature is required' })
  signature: string;
}

/**
 * Combined DTO for backward compatibility - supports both email and Web3 login
 * Uses conditional validation based on which fields are provided
 */
export class LoginDto {
  @ApiPropertyOptional({
    description: 'User email address (required for email login)',
    example: 'john.doe@example.com',
  })
  @ValidateIf((o) => !o.walletAddress)
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required when not using Web3 login' })
  email?: string;

  @ApiPropertyOptional({
    description: 'User password (required for email login)',
    example: 'SecureP@ss123',
  })
  @ValidateIf((o) => !o.walletAddress)
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required when not using Web3 login' })
  password?: string;

  @ApiPropertyOptional({
    description: 'Ethereum wallet address (required for Web3 login)',
    example: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  })
  @ValidateIf((o) => !o.email)
  @IsEthereumAddress({ message: 'Invalid Ethereum wallet address' })
  @IsNotEmpty({ message: 'Wallet address is required for Web3 login' })
  walletAddress?: string;

  @ApiPropertyOptional({
    description: 'Signature from wallet (required for Web3 login)',
    example: '0x...',
  })
  @ValidateIf((o) => !o.email)
  @IsString({ message: 'Signature must be a string' })
  @IsNotEmpty({ message: 'Signature is required for Web3 login' })
  signature?: string;
}
