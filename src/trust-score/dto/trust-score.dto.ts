// @ts-nocheck

export class ScoreFactor {
  score: number;
  maxScore: number;
  percentage: number;
}

export class TrustScoreBreakdownDto {
  emailVerified: ScoreFactor;
  idVerified: ScoreFactor;
  completedTransactions: ScoreFactor;
  activityDecay: ScoreFactor;
  totalScore: number;
  totalMaxScore: number;
}

export class TrustScoreDto {
  userId: string;
  score: number;
  breakdown: TrustScoreBreakdownDto;
  lastUpdated: Date;
  nextUpdateTime?: Date;
}

export class TrustScoreSummaryDto {
  userId: string;
  score: number;
  lastUpdated: Date;
  nextUpdateTime?: Date;
}

export class BatchUpdateResponseDto {
  updated: number;
  failed: number;
}
