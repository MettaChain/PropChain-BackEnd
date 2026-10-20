import { IsIn, IsNumber, IsPositive, IsString, MaxLength } from 'class-validator';

export class CreatePaymentDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  @IsIn(['USD', 'EUR', 'GBP', 'NGN'])
  currency: string;

  @IsString()
  @MaxLength(100)
  reference: string;
}
