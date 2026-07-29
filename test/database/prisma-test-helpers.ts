import { PrismaClient } from '@prisma/client';

const TEST_TABLES = [
  'users',
  'database_backups',
  'backup_schedule_configs',
  'api_keys',
  'password_history',
  'blacklisted_tokens',
  'password_reset_tokens',
  'login_attempts',
  'login_history',
  'properties',
  'property_images',
  'property_favorites',
  'property_views',
  'neighborhoods',
  'neighborhood_schools',
  'neighborhood_amenities',
  'transactions',
  'transaction_tax_strategies',
  'documents',
  'document_versions',
  'user_preferences',
  'activity_logs',
  'sessions',
  'fraud_alerts',
  'fraud_investigation_notes',
  'verification_documents',
  'saved_filters',
  'search_analytics',
  'search_history',
  'popular_searches',
  'search_suggestions',
  'notifications',
  'disputes',
  'transaction_milestones',
  'transaction_history',
  'link_clicks',
  'email_engagements',
  'email_bounces',
  'digest_preferences',
  'property_agents',
  'commissions',
  'property_amenities',
  'property_duplicates',
  'transaction_notes',
  'open_houses',
  'open_house_rsvps',
];

const TRUNCATE_SQL = `TRUNCATE TABLE ${TEST_TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE;`;

export function createTestPrismaClient(): PrismaClient {
  const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      'Missing test database URL. Set TEST_DATABASE_URL or DATABASE_URL before running database-backed tests.',
    );
  }

  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
}

export async function cleanupDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(TRUNCATE_SQL);
}

export async function resetTestDatabase(
  prisma: PrismaClient,
  seedFn?: (prisma: PrismaClient) => Promise<void>,
): Promise<void> {
  await cleanupDatabase(prisma);
  if (seedFn) {
    await seedFn(prisma);
  }
}

export async function withDatabaseCleanup<T>(fn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const prisma = createTestPrismaClient();
  await prisma.$connect();

  try {
    return await fn(prisma);
  } finally {
    await cleanupDatabase(prisma);
    await prisma.$disconnect();
  }
}

export class PrismaTestHelper {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
        },
      },
    });
  }

  async cleanup() {
    // Clean up test data in reverse dependency order
    await this.prisma.transactionNote.deleteMany();
    await this.prisma.transactionHistory.deleteMany();
    await this.prisma.transactionMilestone.deleteMany();
    await this.prisma.commission.deleteMany();
    await this.prisma.transaction.deleteMany();
    await this.prisma.documentVersion.deleteMany();
    await this.prisma.document.deleteMany();
    await this.prisma.propertyImage.deleteMany();
    await this.prisma.propertyFavorite.deleteMany();
    await this.prisma.propertyView.deleteMany();
    await this.prisma.propertyAmenity.deleteMany();
    await this.prisma.property.deleteMany();
    await this.prisma.activityLog.deleteMany();
    await this.prisma.loginHistory.deleteMany();
    await this.prisma.loginAttempt.deleteMany();
    await this.prisma.blacklistedToken.deleteMany();
    await this.prisma.passwordHistory.deleteMany();
    await this.prisma.passwordResetToken.deleteMany();
    await this.prisma.apiKey.deleteMany();
    await this.prisma.session.deleteMany();
    await this.prisma.userPreferences.deleteMany();
    await this.prisma.user.deleteMany();
  }

  async disconnect() {
    await this.prisma.$disconnect();
  }

  get client() {
    return this.prisma;
  }
}
