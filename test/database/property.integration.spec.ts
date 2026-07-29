import { PrismaTestHelper } from './prisma-test-helpers';

describe('Property Database Integration', () => {
  let helper: PrismaTestHelper;

  beforeAll(() => {
    helper = new PrismaTestHelper();
  });

  afterAll(async () => {
    await helper.disconnect();
  });

  beforeEach(async () => {
    await helper.cleanup();
  });

  it('should create and retrieve a property', async () => {
    const user = await helper.client.user.create({
      data: {
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        isVerified: true,
      },
    });

    const property = await helper.client.property.create({
      data: {
        title: 'Test Property',
        address: '123 Test St',
        city: 'Testville',
        state: 'TS',
        zipCode: '12345',
        price: 250000,
        propertyType: 'House',
        ownerId: user.id,
        status: 'ACTIVE',
      },
    });

    expect(property).toBeDefined();
    expect(property.id).toBeDefined();
    expect(property.title).toBe('Test Property');
  });
});
