import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 400,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Application-specific error code',
    example: 'VALIDATION_ERROR',
  })
  errorCode: string;

  @ApiProperty({
    description: 'User-friendly error message',
    example: 'The provided data is invalid',
  })
  message: string;

  @ApiProperty({
    description: 'Detailed error information',
    example: ['email must be a valid email address'],
    required: false,
    type: [String],
  })
  details?: string[];

  @ApiProperty({
    description: 'Timestamp of the error',
    example: '2024-01-22T10:30:00.000Z',
  })
  timestamp: string;

  @ApiProperty({
    description: 'Request path where error occurred',
    example: '/api/v1/users',
  })
  path: string;

  @ApiProperty({
    description: 'Unique request identifier for tracking',
    example: 'req_abc123xyz',
    required: false,
  })
  requestId?: string;

  constructor(partial: Partial<ErrorResponseDto>) {
    Object.assign(this, partial);
    this.timestamp = this.timestamp || new Date().toISOString();
  }
}
