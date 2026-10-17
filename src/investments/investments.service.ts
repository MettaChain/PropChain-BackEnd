import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class InvestmentsService {
  calculateRoi(amountInvested: number, currentValue: number) {
    if (amountInvested <= 0) {
      throw new BadRequestException('amountInvested must be greater than 0');
    }
    const profit = currentValue - amountInvested;
    const roiPercent = Number(((profit / amountInvested) * 100).toFixed(2));
    return { amountInvested, currentValue, profit, roiPercent };
  }
}
