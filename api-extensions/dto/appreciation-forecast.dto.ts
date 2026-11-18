import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CleanText } from '../../src/auth/sanitize.util';

export enum HorizonEnum {
  ONE_YEAR = '1Y',
  THREE_YEARS = '3Y',
  FIVE_YEARS = '5Y',
  TEN_YEARS = '10Y',
}

export class ForecastRequestDto {
  @ApiProperty()
  @IsUUID()
  propertyId: string;

  @ApiProperty({ enum: HorizonEnum, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(HorizonEnum, { each: true })
  horizons: HorizonEnum[];
}

export class ProjectionDto {
  @ApiProperty({ enum: HorizonEnum })
  @IsEnum(HorizonEnum)
  horizon: HorizonEnum;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  projectedValue: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  confidenceLow: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  confidenceHigh: number;
}

export class ForecastFactorDto {
  @ApiProperty()
  @Transform(CleanText)
  @IsString()
  @IsNotEmpty()
  factor: string;

  @ApiProperty({ description: 'Factor weight from 0 to 1' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  weight: number;

  @ApiProperty({ description: 'Signed contribution to the projection' })
  @Type(() => Number)
  @IsNumber()
  contribution: number;
}

export class ForecastResponseDto {
  @ApiProperty()
  @IsUUID()
  propertyId: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  currentValue: number;

  @ApiProperty({ type: [ProjectionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectionDto)
  projections: ProjectionDto[];

  @ApiPropertyOptional({ type: [ForecastFactorDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ForecastFactorDto)
  factors?: ForecastFactorDto[];
}
