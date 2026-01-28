import { IsString, IsNotEmpty, IsArray, IsOptional, IsInt, Min, ArrayMinSize, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiKeyScope } from '../enums/api-key-scope.enum';

export class CreateApiKeyDto {
  @ApiProperty({
    description: 'Friendly name for the API key',
    example: 'Production Integration Key',
    maxLength: 100,
  })
  @IsString({ message: 'Name must be a string' })
  @IsNotEmpty({ message: 'Name is required' })
  @MaxLength(100, { message: 'Name must not exceed 100 characters' })
  name: string;

  @ApiProperty({
    description: 'Scopes/permissions for the API key',
    example: ['read:properties', 'write:properties'],
    enum: ApiKeyScope,
    isArray: true,
  })
  @IsArray({ message: 'Scopes must be an array' })
  @ArrayMinSize(1, { message: 'At least one scope is required' })
  @IsString({ each: true, message: 'Each scope must be a string' })
  scopes: string[];

  @ApiPropertyOptional({
    description: 'Rate limit (requests per minute) for this key. If not provided, uses global default.',
    example: 100,
    minimum: 1,
  })
  @IsOptional()
  @IsInt({ message: 'Rate limit must be an integer' })
  @Min(1, { message: 'Rate limit must be at least 1' })
  rateLimit?: number;
}
