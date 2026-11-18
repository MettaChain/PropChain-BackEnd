import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import {
  CreateScreeningDto,
  RiskFactorDto,
  RiskSeverity,
  ScreeningRecommendation,
  ScreeningResultDto,
  ScreeningStatus,
} from './dto/tenant-screening.dto';

interface ScreeningRecord extends ScreeningResultDto {
  applicantName: string;
  applicantEmail: string;
  monthlyIncome: number;
  monthlyRent: number;
  optOut: boolean;
}

@Injectable()
export class TenantScreeningService {
  private readonly screenings = new Map<string, ScreeningRecord>();

  create(dto: CreateScreeningDto): ScreeningResultDto {
    if (!dto.consent) {
      throw new BadRequestException('Applicant consent is required before screening');
    }

    const now = new Date();
    const record: ScreeningRecord = {
      id: randomUUID(),
      propertyId: dto.propertyId,
      status: ScreeningStatus.PENDING,
      applicantName: dto.applicantName.trim(),
      applicantEmail: dto.applicantEmail.trim().toLowerCase(),
      monthlyIncome: dto.monthlyIncome,
      monthlyRent: dto.monthlyRent,
      optOut: dto.optOut ?? false,
      createdAt: now,
    };

    this.screenings.set(record.id, record);
    return this.toResponse(record);
  }

  findAll(propertyId?: string): ScreeningResultDto[] {
    return Array.from(this.screenings.values())
      .filter((record) => !propertyId || record.propertyId === propertyId)
      .map((record) => this.toResponse(record));
  }

  findOne(id: string): ScreeningResultDto {
    return this.toResponse(this.getRecord(id));
  }

  process(id: string): ScreeningResultDto {
    const record = this.getRecord(id);
    if (record.status === ScreeningStatus.COMPLETED) {
      return this.toResponse(record);
    }

    record.status = ScreeningStatus.IN_PROGRESS;
    const seed = parseInt(
      createHash('sha256').update(record.applicantEmail).digest('hex').slice(0, 8),
      16,
    );
    const creditScore = 520 + (seed % 331);
    const backgroundStatus = seed % 7 === 0 ? 'CONSIDER' : 'CLEAR';
    const incomeRatio = record.monthlyRent > 0 ? record.monthlyIncome / record.monthlyRent : 0;
    const incomeVerified = incomeRatio >= 2.5;

    const riskFactors: RiskFactorDto[] = [];
    if (creditScore < 600) {
      riskFactors.push({
        factor: 'credit_score',
        severity: RiskSeverity.HIGH,
        description: 'Credit score is below the preferred threshold',
      });
    }
    if (!incomeVerified) {
      riskFactors.push({
        factor: 'income_verification',
        severity: RiskSeverity.MEDIUM,
        description: 'Income does not meet the 2.5x rent guideline',
      });
    }
    if (backgroundStatus !== 'CLEAR') {
      riskFactors.push({
        factor: 'background_check',
        severity: RiskSeverity.HIGH,
        description: 'Background check requires manual review',
      });
    }
    if (record.monthlyIncome > 0 && record.monthlyRent / record.monthlyIncome > 0.4) {
      riskFactors.push({
        factor: 'rent_to_income',
        severity: RiskSeverity.MEDIUM,
        description: 'Rent consumes more than 40% of monthly income',
      });
    }

    const creditPoints = Math.max(0, Math.min(50, ((creditScore - 300) / 550) * 50));
    const incomePoints = Math.min(30, (incomeRatio / 5) * 30);
    const backgroundPoints = backgroundStatus === 'CLEAR' ? 20 : 5;
    const overallScore = Math.round(creditPoints + incomePoints + backgroundPoints);

    record.creditScore = creditScore;
    record.backgroundStatus = backgroundStatus;
    record.incomeVerified = incomeVerified;
    record.overallScore = overallScore;
    record.riskFactors = riskFactors;
    record.recommendation =
      overallScore >= 75
        ? ScreeningRecommendation.APPROVE
        : overallScore >= 55
          ? ScreeningRecommendation.CONDITIONAL
          : ScreeningRecommendation.DENY;
    record.status = ScreeningStatus.COMPLETED;
    record.completedAt = new Date();

    if (record.optOut) {
      record.applicantName = 'REDACTED';
      record.applicantEmail = 'redacted@example.invalid';
    }

    return this.toResponse(record);
  }

  private getRecord(id: string): ScreeningRecord {
    const record = this.screenings.get(id);
    if (!record) throw new NotFoundException(`Screening ${id} not found`);
    return record;
  }

  private toResponse(record: ScreeningRecord): ScreeningResultDto {
    return {
      id: record.id,
      propertyId: record.propertyId,
      status: record.status,
      creditScore: record.creditScore,
      backgroundStatus: record.backgroundStatus,
      incomeVerified: record.incomeVerified,
      overallScore: record.overallScore,
      recommendation: record.recommendation,
      riskFactors: record.riskFactors ? [...record.riskFactors] : undefined,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
    };
  }
}
