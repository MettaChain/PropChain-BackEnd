import { IsArray, IsEnum, IsOptional, IsString, IsUUID, ArrayMinSize } from 'class-validator';
import { PropertyStatus } from '../../types/prisma.types';

export class BulkPropertyStatusUpdateDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  propertyIds!: string[];

  @IsEnum(PropertyStatus)
  status!: PropertyStatus;
}

export class BulkPropertyDeleteDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  propertyIds!: string[];
}

export class BulkPropertyExportDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  propertyIds!: string[];

  @IsOptional()
  @IsString()
  filter?: string;
}
