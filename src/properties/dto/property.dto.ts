import { IsString, IsNumber, IsOptional, IsArray, IsIn } from 'class-validator';
import { InputType, Field, Float } from '@nestjs/graphql';

export const PROPERTY_STATUS_ENUM = [
  'DRAFT',
  'PENDING',
  'ACTIVE',
  'UNDER_CONTRACT',
  'SOLD',
  'RENTED',
  'ARCHIVED',
] as const;

@InputType()
export class CreatePropertyDto {
  @Field()
  @IsString()
  title: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Field()
  @IsString()
  address: string;

  @Field()
  @IsString()
  city: string;

  @Field()
  @IsString()
  state: string;

  @Field()
  @IsString()
  zipCode: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  country?: string;

  @Field(() => Float)
  @IsNumber()
  price: number;

  @Field()
  @IsString()
  propertyType: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  bedrooms?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  bathrooms?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  squareFeet?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  lotSize?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  yearBuilt?: number;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  longitude?: number;
}

import { PropertyStatus } from '../../common/common.types';

@InputType()
export class UpdatePropertyDto {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  title?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  address?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  city?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  state?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  zipCode?: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  price?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  propertyType?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  bedrooms?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  bathrooms?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  squareFeet?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  lotSize?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  yearBuilt?: number;

  @Field(() => PropertyStatus, { nullable: true })
  @IsOptional()
  @IsIn(PROPERTY_STATUS_ENUM)
  status?: PropertyStatus;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  longitude?: number;
}
