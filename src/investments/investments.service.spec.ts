import { BadRequestException } from '@nestjs/common';
import { InvestmentsService } from './investments.service';

describe('InvestmentsService', () => {
  let service: InvestmentsService;

  beforeEach(() => {
    service = new InvestmentsService();
  });

  it('calculates a positive ROI', () => {
    expect(service.calculateRoi(1000, 1200)).toEqual({
      amountInvested: 1000,
      currentValue: 1200,
      profit: 200,
      roiPercent: 20,
    });
  });

  it('calculates a negative ROI', () => {
    expect(service.calculateRoi(1000, 800).roiPercent).toBe(-20);
  });

  it('throws when amountInvested is not positive', () => {
    expect(() => service.calculateRoi(0, 100)).toThrow(BadRequestException);
  });
});
