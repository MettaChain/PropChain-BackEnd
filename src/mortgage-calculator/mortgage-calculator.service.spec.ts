import { MortgageCalculatorService } from './mortgage-calculator.service';

describe('MortgageCalculatorService', () => {
  let service: MortgageCalculatorService;

  beforeEach(() => {
    service = new MortgageCalculatorService();
  });

  it('calculates monthly payment correctly', () => {
    // $300,000 property, 20% down, 6% annual rate, 30-year amortization
    const result = service.calculate({
      propertyPrice: 300_000,
      downPaymentPercent: 20,
      annualInterestRate: 6,
      amortizationYears: 30,
    });

    expect(result.downPayment).toBe(60_000);
    expect(result.loanAmount).toBe(240_000);
    // Standard amortization formula: M = 240000 * (0.005 * 1.005^360) / (1.005^360 - 1) ≈ 1438.92
    expect(result.monthlyPayment).toBe(1438.92);
    expect(result.totalPayment).toBe(518_011.2);
    expect(result.totalInterest).toBe(278_011.2);
  });

  it('calculates correctly with zero interest rate', () => {
    const result = service.calculate({
      propertyPrice: 120_000,
      downPaymentPercent: 0,
      annualInterestRate: 0,
      amortizationYears: 10,
    });

    expect(result.loanAmount).toBe(120_000);
    expect(result.monthlyPayment).toBe(1_000); // 120000 / 120
    expect(result.totalInterest).toBe(0);
  });

  it('calculates down payment amount from percent', () => {
    const result = service.calculate({
      propertyPrice: 500_000,
      downPaymentPercent: 10,
      annualInterestRate: 5,
      amortizationYears: 25,
    });

    expect(result.downPayment).toBe(50_000);
    expect(result.loanAmount).toBe(450_000);
  });

  it('returns correct metadata fields', () => {
    const result = service.calculate({
      propertyPrice: 200_000,
      downPaymentPercent: 20,
      annualInterestRate: 4,
      amortizationYears: 15,
    });

    expect(result.propertyPrice).toBe(200_000);
    expect(result.annualInterestRate).toBe(4);
    expect(result.amortizationYears).toBe(15);
  });

  it('rounds monetary values to 2 decimal places', () => {
    const result = service.calculate({
      propertyPrice: 333_333,
      downPaymentPercent: 15,
      annualInterestRate: 3.75,
      amortizationYears: 20,
    });

    const hasAtMostTwoDecimals = (n: number) => Number.isInteger(Math.round(n * 100));
    expect(hasAtMostTwoDecimals(result.monthlyPayment)).toBe(true);
    expect(hasAtMostTwoDecimals(result.totalPayment)).toBe(true);
    expect(hasAtMostTwoDecimals(result.totalInterest)).toBe(true);
  });

  it('totalPayment equals monthlyPayment * amortizationYears * 12', () => {
    const result = service.calculate({
      propertyPrice: 400_000,
      downPaymentPercent: 25,
      annualInterestRate: 5.5,
      amortizationYears: 30,
    });

    expect(result.totalPayment).toBe(
      Math.round(result.monthlyPayment * 30 * 12 * 100) / 100,
    );
  });

  it('totalInterest equals totalPayment minus loanAmount', () => {
    const result = service.calculate({
      propertyPrice: 250_000,
      downPaymentPercent: 5,
      annualInterestRate: 7,
      amortizationYears: 20,
    });

    expect(result.totalInterest).toBe(
      Math.round((result.totalPayment - result.loanAmount) * 100) / 100,
    );
  });
});
