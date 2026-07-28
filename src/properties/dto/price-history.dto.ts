// @ts-nocheck

import { IsString, IsOptional, IsNumber, IsDateString } from 'class-validator';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Type } from 'class-transformer';
import { InputType, Field, Float, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class PriceHistoryResponseDto {
  @Field()
  id: string;

  @Field()
  propertyId: string;

  @Field(() => Float)
  oldPrice: number;

  @Field(() => Float)
  newPrice: number;

  @Field(() => Float)
  changeAmount: number;

  @Field(() => Float)
  changePercentage: number;

  @Field({ nullable: true })
  changedBy?: string;

  @Field({ nullable: true })
  changeReason?: string;

  @Field()
  createdAt: Date;
}

@ObjectType()
export class ChartDataPointDto {
  @Field()
  date: string;

  @Field(() => Float)
  price: number;

  @Field(() => Float, { nullable: true })
  changePercentage?: number;
}

@ObjectType()
export class PriceHistoryChartDataDto {
  @Field()
  propertyId: string;

  @Field(() => [ChartDataPointDto])
  data: ChartDataPointDto[];

  @Field(() => Float)
  currentPrice: number;

  @Field(() => Float)
  initialPrice: number;

  @Field(() => Float)
  totalChangePercentage: number;

  @Field()
  totalChanges: number;
}

@InputType()
export class GetPriceHistoryQueryDto {
  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  limit?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsNumber()
  offset?: number;
}

@InputType()
export class GetChartDataQueryDto {
  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  interval?: 'day' | 'week' | 'month' | 'year';
}
