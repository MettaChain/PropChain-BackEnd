// @ts-nocheck

import { IsString, IsNumber, IsOptional, IsArray, IsIn, IsUrl } from 'class-validator';
import { Type } from 'class-transformer';
import { InputType, Field, Float } from '@nestjs/graphql';
import { PROPERTY_STATUS_ENUM, PropertyStatusLiteral } from '../../common/common.types';

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

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  category?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl()
  virtualTourUrl?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl()
  videoUrl?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  hoaName?: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  hoaMonthlyFee?: number;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hoaAmenities?: string[];

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  hoaContactInfo?: string;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  expiryDate?: Date;
}

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

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  country?: string;

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

  @Field(() => PropertyStatusLiteral, { nullable: true })
  @IsOptional()
  @IsIn(PROPERTY_STATUS_ENUM)
  status?: PropertyStatusLiteral;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  expiryDate?: Date;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  category?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl()
  virtualTourUrl?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl()
  videoUrl?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  hoaName?: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  hoaMonthlyFee?: number;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hoaAmenities?: string[];

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  hoaContactInfo?: string;
}
