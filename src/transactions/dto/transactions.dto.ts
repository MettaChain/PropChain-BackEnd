// @ts-nocheck

import { Type } from 'class-transformer';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { IsDate, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { TransactionStatus, TransactionType } from '../../types/prisma.types';

export enum TransactionSortField {
  CREATED_AT = 'createdAt',
  AMOUNT = 'amount',
  STATUS = 'status',
  TYPE = 'type',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class TransactionHistoryQueryDto {
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @IsOptional()
  @IsUUID('4')
  propertyId?: string;

  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsEnum(TransactionSortField)
  sortBy: TransactionSortField = TransactionSortField.CREATED_AT;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.DESC;
}
