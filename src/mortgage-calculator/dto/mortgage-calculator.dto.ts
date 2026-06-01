import { IsNumber, IsPositive, Min, Max } from 'class-validator';

export class MortgageCalculatorDto {
  @IsNumber()
  @IsPositive()
  propertyPrice: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  downPaymentPercent: number;

  @IsNumber()
  @IsPositive()
  @Max(100)
  annualInterestRate: number;

  @IsNumber()
  @IsPositive()
  amortizationYears: number;
}

export class MortgageResultDto {
  propertyPrice: number;
  downPayment: number;
  loanAmount: number;
  annualInterestRate: number;
  amortizationYears: number;
  monthlyPayment: number;
  totalPayment: number;
  totalInterest: number;
}
