// @ts-nocheck

import { IsNumber, IsPositive, Min, Max, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

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

export class AmortizationScheduleDto {
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

  @IsNumber()
  @IsOptional()
  @IsPositive()
  annualPropertyTax?: number;

  @IsNumber()
  @IsOptional()
  @IsPositive()
  annualInsurance?: number;
}

export class AmortizationEntry {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  pmi: number;
  propertyTax: number;
  insurance: number;
  totalPayment: number;
  balance: number;
}

export class MortgageScenarioDto {
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

  @IsString()
  @IsOptional()
  label?: string;
}

import { IsString } from 'class-validator';

export class CompareScenariosDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MortgageScenarioDto)
  scenarios: MortgageScenarioDto[];
}

export class ExportAmortizationDto {
  @IsArray()
  schedule: AmortizationEntry[];

  @IsString()
  @IsOptional()
  format?: 'csv' | 'text';
}
