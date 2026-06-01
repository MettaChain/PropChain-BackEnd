import { PrismaClient, Prisma } from '@prisma/client';
import { cleanupDatabase, createTestPrismaClient, resetTestDatabase } from './prisma-test-helpers';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

const describeIfDatabase = databaseUrl ? describe : describe.skip;

describeIfDatabase('Prisma test helpers', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await cleanupDatabase(prisma);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma, async (db) => {
      await db.user.create({
        data: {
          email: 'test-seed@example.com',
          firstName: 'Seed',
          lastName: 'User',
        },
      });
    });
  });

  afterEach(async () => {
    await cleanupDatabase(prisma);
  });

  it('cleans created records after each test', async () => {
    const seedUser = await prisma.user.findUnique({ where: { email: 'test-seed@example.com' } });
    expect(seedUser).toBeTruthy();

    const property = await prisma.property.create({
      data: {
        title: 'Test Property',
        address: '123 Test Lane',
        city: 'Testville',
        state: 'TS',
        zipCode: '12345',
        price: new Prisma.Decimal(100000),
        propertyType: 'House',
        features: [],
        tags: [],
        ownerId: seedUser!.id,
      },
    });

    expect(property).toBeDefined();
    expect(await prisma.property.count()).toBe(1);
  });

  it('resets seeded data between test suites', async () => {
    const seedUser = await prisma.user.findUnique({ where: { email: 'test-seed@example.com' } });
    expect(seedUser).toBeTruthy();
    expect(seedUser?.firstName).toBe('Seed');
  });
});
