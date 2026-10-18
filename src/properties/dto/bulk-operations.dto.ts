import { IsArray, IsEnum, IsOptional, IsString, IsUUID, ArrayMinSize } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PropertyStatus } from '../../types/prisma.types';

export class BulkPropertyStatusUpdateDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 1,
    description: 'Ids of the listings to update.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  propertyIds!: string[];

  @ApiProperty({ enum: PropertyStatus, description: 'The status to apply to every listing.' })
  @IsEnum(PropertyStatus)
  status!: PropertyStatus;
}

export class BulkPropertyDeleteDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 1,
    description: 'Ids of the listings to soft-delete.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  propertyIds!: string[];
}

export class BulkPropertyExportDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 1,
    description: 'Ids of the listings to export.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  propertyIds!: string[];


  @ApiPropertyOptional({
    description: 'Only export listings whose title contains this text.',
  })

  @Transform(TrimListingQuery)

  @IsOptional()
  @IsString()
  filter?: string;
}
