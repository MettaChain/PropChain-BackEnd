import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';

export class CreateOpenHouseDto {
  @IsString()
  @IsNotEmpty()
  propertyId: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  startAt: string; // ISO date string

  @IsDateString()
  endAt: string; // ISO date string
}
