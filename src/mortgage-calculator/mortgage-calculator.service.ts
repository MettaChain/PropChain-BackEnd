// @ts-nocheck

import { Injectable } from '@nestjs/common';
import {
  MortgageCalculatorDto,
  MortgageResultDto,
  AmortizationScheduleDto,
  AmortizationEntry,
  MortgageScenarioDto,
  ExportAmortizationDto,
} from './dto/mortgage-calculator.dto';

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

  generateAmortizationSchedule(dto: AmortizationScheduleDto): {
    schedule: AmortizationEntry[];
    summary: {
      totalPayment: number;
      totalInterest: number;
      totalPMI: number;
      totalPropertyTax: number;
      totalInsurance: number;
      monthlyPaymentBreakdown: {
        principalAndInterest: number;
        pmi: number;
        propertyTax: number;
        insurance: number;
        total: number;
      };
    };
  } {
    const {
      propertyPrice,
      downPaymentPercent,
      annualInterestRate,
      amortizationYears,
      annualPropertyTax = 0,
      annualInsurance = 0,
    } = dto;

    const downPayment = propertyPrice * (downPaymentPercent / 100);
    const loanAmount = propertyPrice - downPayment;
    const monthlyRate = annualInterestRate / 100 / 12;
    const numPayments = amortizationYears * 12;
    const needsPMI = downPaymentPercent < 20;

    const monthlyPI =
      monthlyRate === 0
        ? loanAmount / numPayments
        : (loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments))) /
          (Math.pow(1 + monthlyRate, numPayments) - 1);

    const monthlyPropertyTax = annualPropertyTax / 12;
    const monthlyInsurance = annualInsurance / 12;
    const pmiRate = 0.005;
    const monthlyPMI = needsPMI ? (loanAmount * pmiRate) / 12 : 0;

    const schedule: AmortizationEntry[] = [];
    let balance = loanAmount;
    let totalInterest = 0;
    let totalPMI = 0;

    for (let month = 1; month <= numPayments; month++) {
      const interestPayment = balance * monthlyRate;
      const principalPayment = monthlyPI - interestPayment;
      const currentPMI = balance > loanAmount * 0.8 ? monthlyPMI : 0;

      balance = Math.max(0, balance - principalPayment);
      totalInterest += interestPayment;
      totalPMI += currentPMI;

      const totalPayment = this.round(
        monthlyPI + currentPMI + monthlyPropertyTax + monthlyInsurance,
      );

      schedule.push({
        month,
        payment: this.round(monthlyPI),
        principal: this.round(principalPayment),
        interest: this.round(interestPayment),
        pmi: this.round(currentPMI),
        propertyTax: this.round(monthlyPropertyTax),
        insurance: this.round(monthlyInsurance),
        totalPayment,
        balance: this.round(balance),
      });
    }

    const monthlyPaymentBreakdown = {
      principalAndInterest: this.round(monthlyPI),
      pmi: this.round(monthlyPMI),
      propertyTax: this.round(monthlyPropertyTax),
      insurance: this.round(monthlyInsurance),
      total: this.round(monthlyPI + monthlyPMI + monthlyPropertyTax + monthlyInsurance),
    };

    return {
      schedule,
      summary: {
        totalPayment: this.round(
          monthlyPI * numPayments + totalPMI + monthlyPropertyTax * numPayments + monthlyInsurance * numPayments,
        ),
        totalInterest: this.round(totalInterest),
        totalPMI: this.round(totalPMI),
        totalPropertyTax: this.round(monthlyPropertyTax * numPayments),
        totalInsurance: this.round(monthlyInsurance * numPayments),
        monthlyPaymentBreakdown,
      },
    };
  }

  compareScenarios(scenarios: MortgageScenarioDto[]) {
    const results = scenarios.map((scenario, index) => {
      const calculation = this.calculate(scenario);
      const amortization = this.generateAmortizationSchedule(scenario);

      return {
        index,
        label: scenario.label || `Scenario ${index + 1}`,
        ...calculation,
        totalCost: amortization.summary.totalPayment,
        monthlyBreakdown: amortization.summary.monthlyPaymentBreakdown,
      };
    });

    const sortedByPayment = [...results].sort((a, b) => a.monthlyPayment - b.monthlyPayment);
    const sortedByTotal = [...results].sort((a, b) => a.totalCost - b.totalCost);

    return {
      scenarios: results,
      recommendation: {
        lowestMonthly: sortedByPayment[0]?.label,
        lowestTotalCost: sortedByTotal[0]?.label,
        monthlySavings: this.round(
          (sortedByPayment[sortedByPayment.length - 1]?.monthlyPayment || 0) -
            (sortedByPayment[0]?.monthlyPayment || 0),
        ),
        totalSavings: this.round(
          (sortedByTotal[sortedByTotal.length - 1]?.totalCost || 0) -
            (sortedByTotal[0]?.totalCost || 0),
        ),
      },
    };
  }

  exportAmortization(schedule: AmortizationEntry[], format: 'csv' | 'text' = 'csv'): string {
    if (format === 'csv') {
      return this.exportAsCsv(schedule);
    }
    return this.exportAsText(schedule);
  }

  private exportAsCsv(schedule: AmortizationEntry[]): string {
    const headers = [
      'Month',
      'Payment',
      'Principal',
      'Interest',
      'PMI',
      'Property Tax',
      'Insurance',
      'Total Payment',
      'Balance',
    ];

    const rows = schedule.map((entry) =>
      [
        entry.month,
        entry.payment.toFixed(2),
        entry.principal.toFixed(2),
        entry.interest.toFixed(2),
        entry.pmi.toFixed(2),
        entry.propertyTax.toFixed(2),
        entry.insurance.toFixed(2),
        entry.totalPayment.toFixed(2),
        entry.balance.toFixed(2),
      ].join(','),
    );

    return [headers.join(','), ...rows].join('\n');
  }

  private exportAsText(schedule: AmortizationEntry[]): string {
    const lines: string[] = [];
    lines.push('AMORTIZATION SCHEDULE');
    lines.push('='.repeat(95));
    lines.push(
      'Month'.padEnd(8) +
      'Payment'.padEnd(12) +
      'Principal'.padEnd(12) +
      'Interest'.padEnd(12) +
      'PMI'.padEnd(10) +
      'Tax'.padEnd(10) +
      'Insurance'.padEnd(12) +
      'Balance'.padEnd(14),
    );
    lines.push('-'.repeat(95));

    for (const entry of schedule) {
      lines.push(
        String(entry.month).padEnd(8) +
        entry.payment.toFixed(2).padEnd(12) +
        entry.principal.toFixed(2).padEnd(12) +
        entry.interest.toFixed(2).padEnd(12) +
        entry.pmi.toFixed(2).padEnd(10) +
        entry.propertyTax.toFixed(2).padEnd(10) +
        entry.insurance.toFixed(2).padEnd(12) +
        entry.balance.toFixed(2).padEnd(14),
      );
    }

    const totalInterest = schedule.reduce((sum, e) => sum + e.interest, 0);
    const totalPMI = schedule.reduce((sum, e) => sum + e.pmi, 0);
    lines.push('-'.repeat(95));
    lines.push(`Total Interest: $${totalInterest.toFixed(2)}`);
    lines.push(`Total PMI: $${totalPMI.toFixed(2)}`);
    lines.push(`Final Balance: $${schedule[schedule.length - 1]?.balance.toFixed(2) || '0.00'}`);

    return lines.join('\n');
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
