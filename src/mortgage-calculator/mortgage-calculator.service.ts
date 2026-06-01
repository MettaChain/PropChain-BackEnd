import { Injectable } from '@nestjs/common';
import { MortgageCalculatorDto, MortgageResultDto } from './dto/mortgage-calculator.dto';

@Injectable()
export class MortgageCalculatorService {
  calculate(dto: MortgageCalculatorDto): MortgageResultDto {
    const { propertyPrice, downPaymentPercent, annualInterestRate, amortizationYears } = dto;

    const downPayment = this.round(propertyPrice * (downPaymentPercent / 100));
    const loanAmount = this.round(propertyPrice - downPayment);
    const monthlyRate = annualInterestRate / 100 / 12;
    const numPayments = amortizationYears * 12;

    const monthlyPayment =
      monthlyRate === 0
        ? this.round(loanAmount / numPayments)
        : this.round(
            (loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments))) /
              (Math.pow(1 + monthlyRate, numPayments) - 1),
          );

    const totalPayment = this.round(monthlyPayment * numPayments);
    const totalInterest = this.round(totalPayment - loanAmount);

    return {
      propertyPrice,
      downPayment,
      loanAmount,
      annualInterestRate,
      amortizationYears,
      monthlyPayment,
      totalPayment,
      totalInterest,
    };
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
