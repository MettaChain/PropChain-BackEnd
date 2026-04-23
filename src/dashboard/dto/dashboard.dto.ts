import { Decimal } from '@prisma/client/runtime/library';

// Profile Summary DTO
export class ProfileSummaryDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: string;
  avatar?: string;
  isVerified: boolean;
  createdAt: Date;
  memberSince: string; // formatted date
}

// Activity Item DTO
export class ActivityItemDto {
  id: string;
  type: 'property_created' | 'transaction_completed' | 'property_updated' | 'transaction_pending';
  title: string;
  description: string;
  timestamp: Date;
  relatedId?: string; // property or transaction id
}

// Quick Stats DTO
export class QuickStatsDto {
  totalProperties: number;
  activeListings: number;
  pendingTransactions: number;
  completedTransactions: number;
  totalTransactionValue: Decimal;
}

// Recommendation Item DTO
export class RecommendationItemDto {
  id: string;
  title: string;
  address: string;
  city: string;
  state: string;
  price: Decimal;
  propertyType: string;
  bedrooms?: number;
  bathrooms?: Decimal;
  reason: string; // why it's recommended
}

// Main Dashboard DTO
export class DashboardDto {
  profile: ProfileSummaryDto;
  stats: QuickStatsDto;
  recentActivity: ActivityItemDto[];
  recommendations: RecommendationItemDto[];
}
