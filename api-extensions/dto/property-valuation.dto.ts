import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CleanText } from '../../src/auth/sanitize.util';

export class ComparableSaleDto {
  @ApiProperty({ description: 'Comparable property address' })
  @Transform(CleanText)
  @IsString()
  address: string;

  @ApiProperty({ description: 'Comparable sale price' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salePrice: number;

  @ApiProperty({ description: 'Date the comparable property sold' })
  @Type(() => Date)
  @IsDate()
  saleDate: Date;

  @ApiProperty({ description: 'Distance from the subject property in kilometres' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  distance: number;

  @ApiProperty({ description: 'Similarity score from 0 to 100' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  similarityScore: number;
}

export class CreateValuationDto {
  @ApiProperty({ description: 'Property identifier' })
  @IsUUID()
  propertyId: string;

  @ApiPropertyOptional({ type: [ComparableSaleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComparableSaleDto)
  comparables?: ComparableSaleDto[];

  @ApiPropertyOptional({ description: 'Valuation notes' })
  @IsOptional()
  @Transform(CleanText)
  @IsString()
  notes?: string;
}

export class ValuationMetadataDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  radiusKm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;
}

export class ValuationResponseDto {
  @ApiProperty()
  propertyId: string;

  @ApiProperty({ description: 'Estimated property value' })
  @IsNumber()
  @Min(0)
  estimatedValue: number;

  @ApiProperty({ description: 'Confidence score from 0 to 100' })
  @IsNumber()
  @Min(0)
  @Max(100)
  confidence: number;

  @ApiProperty()
  comparableCount: number;

  @ApiPropertyOptional({ type: [ComparableSaleDto] })
  comparables?: ComparableSaleDto[];

  @ApiProperty()
  valuationDate: Date;

  @ApiPropertyOptional({ type: ValuationMetadataDto })
  @IsOptional()
  @IsObject()
  metadata?: ValuationMetadataDto;
}
