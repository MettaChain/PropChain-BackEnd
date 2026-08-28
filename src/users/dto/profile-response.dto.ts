export class ProfileResponseDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  avatar: string | null;
  bio: string | null;
  role: string;
  isVerified: boolean;
  preferredChannel: string | null;
  languagePreference: string | null;
  timezone: string | null;
  contactHours: { start: string; end: string } | null;
  address: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  } | null;
  occupation: string | null;
  company: string | null;
  referralCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date | null;
  statistics: {
    propertiesCount: number;
    transactionsCount: number;
    accountAgeDays: number;
  } | null;
}
