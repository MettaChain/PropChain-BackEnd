import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsString } from 'class-validator';

export class CreateInvestmentDto {
  @ApiProperty({ example: 'property-123', description: 'ID of the property being invested in' })
  @IsString()
  propertyId: string;

  @ApiProperty({ example: 5000, description: 'Investment amount' })
  @IsNumber()
  @IsPositive()
  amount: number;
}

export class InvestmentResponseDto {
  @ApiProperty({ example: 'a1b2c3' })
  id: string;

  @ApiProperty({ example: 'property-123' })
  propertyId: string;

  @ApiProperty({ example: 5000 })
  amount: number;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt: string;
}
