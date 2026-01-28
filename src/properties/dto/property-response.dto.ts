import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AddressDto, PropertyType, PropertyStatus } from './create-property.dto';

export class PropertyResponseDto {
  @ApiProperty({
    description: 'Property unique identifier',
    example: 'prop_abc123',
  })
  id: string;

  @ApiProperty({
    description: 'Property title',
    example: 'Luxury Downtown Apartment',
  })
  title: string;

  @ApiPropertyOptional({
    description: 'Property description',
    example: 'Beautiful 2-bedroom apartment with city views',
  })
  description?: string;

  @ApiProperty({
    description: 'Property price in USD',
    example: 500000,
  })
  price: number;

  @ApiProperty({
    description: 'Property address',
    type: AddressDto,
  })
  address: AddressDto;

  @ApiPropertyOptional({
    description: 'Property features',
    example: ['Swimming Pool', 'Garage'],
    type: [String],
  })
  features?: string[];

  @ApiPropertyOptional({
    description: 'Property type',
    enum: PropertyType,
    example: PropertyType.RESIDENTIAL,
  })
  type?: PropertyType;

  @ApiProperty({
    description: 'Property status',
    enum: PropertyStatus,
    example: PropertyStatus.AVAILABLE,
  })
  status: PropertyStatus;

  @ApiPropertyOptional({
    description: 'Number of bedrooms',
    example: 3,
  })
  bedrooms?: number;

  @ApiPropertyOptional({
    description: 'Number of bathrooms',
    example: 2,
  })
  bathrooms?: number;

  @ApiPropertyOptional({
    description: 'Property size in square feet',
    example: 1500,
  })
  areaSqFt?: number;

  @ApiProperty({
    description: 'Property owner ID',
    example: 'user_abc123',
  })
  ownerId: string;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-01-15T08:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2024-01-22T09:00:00.000Z',
  })
  updatedAt: Date;
}
