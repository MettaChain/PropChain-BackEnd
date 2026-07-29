import { DataExportService } from './data-export.service';
import { I18nService } from '../i18n/i18n.service';
import { promises as fs } from 'fs';

const baseUser = {
  id: 'user-1',
  email: 'u@example.com',
  firstName: 'Ada',
  password: 'bcrypthash',
  twoFactorSecret: 'totpsecret',
  preferences: { language: 'en', currency: 'USD' },
  activityLogs: [{ id: 'a1', action: 'LOGIN' }],
  loginHistory: [{ id: 'l1', ipAddress: '10.0.0.1' }],
  fraudAlerts: [],
  sessions: [{ id: 's1', ipAddress: '10.0.0.1' }],
  searchHistory: [{ id: 'h1', query: 'apartment' }],
  searchAnalytics: [],
  savedFilters: [],
  notifications: [],
  properties: [{ id: 'p1', title: 'House A' }],
  documents: [],
  buyerTransactions: [],
  sellerTransactions: [],
  emailEngagements: [],
  emailBounces: [],
  favorites: [],
  propertyViews: [],
  verificationDocuments: [],
  passwordHistory: [{ id: 'ph1', passwordHash: 'oldhash' }],
  apiKeys: [{ id: 'k1', keyHash: 'supersecret' }],
  blacklistedTokens: [],
  passwordResetTokens: [],
  supportTickets: [],
  assignedTickets: [],
  webhooks: [{ id: 'w1', secret: 'webhooksecret' }],
  digestPreference: null,
};

function buildHarness() {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(baseUser),
    },
    exportJob: {
      create: jest
        .fn()
        .mockImplementation((args: any) => Promise.resolve({ id: 'job-1', ...args.data })),
      update: jest
        .fn()
        .mockImplementation((args: any) => Promise.resolve({ id: 'job-1', ...args.data })),
      findUnique: jest.fn().mockResolvedValue({
        id: 'job-1',
        status: 'COMPLETED',
        fileUrl: '/tmp/fake.zip',
      }),
    },
  } as any;
  const email = {
    sendEmail: jest.fn().mockResolvedValue({ id: 'msg-1' }),
  } as any;
  const i18n = new I18nService();
  const service = new DataExportService(prisma, email, i18n);
  return { service, prisma, email, i18n };
}

describe('DataExportService', () => {
  it('returns a schema-versioned payload covering all expected record categories', async () => {
    const harness = buildHarness();
    const result = await harness.service.buildPayload('user-1');
    expect(result.records).toEqual(
      expect.objectContaining({
        profile: expect.objectContaining({
          id: 'user-1',
          email: 'u@example.com',
          password: '[redacted]',
          twoFactorSecret: '[redacted]',
        }),
        activityLogs: expect.any(Array),
        loginHistory: expect.any(Array),
        sessions: expect.any(Array),
        searchHistory: expect.any(Array),
        properties: expect.any(Array),
        transactions: expect.objectContaining({
          asBuyer: expect.any(Array),
          asSeller: expect.any(Array),
        }),
      }),
    );
    expect(result.records.passwordHistory).toEqual([
      expect.objectContaining({ passwordHash: '[redacted]' }),
    ]);
    expect(result.records.apiKeys).toEqual([expect.objectContaining({ keyHash: '[redacted]' })]);
    expect(result.records.webhooks).toEqual([expect.objectContaining({ secret: '[redacted]' })]);
  });

  it('writes an ExportJob row, archives the payload, and notifies by email', async () => {
    const harness = buildHarness();
    const result = await harness.service.exportPersonalData({ userId: 'user-1' });
    expect(result.jobId).toBe('job-1');
    expect(result.filePath).toMatch(/.+\.zip$/);
    expect(result.bytes).toBeGreaterThan(0);
    expect(harness.prisma.exportJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'EXPORT', status: 'PROCESSING' }),
      }),
    );
    expect(harness.prisma.exportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );

    const archive = await fs.stat(result.filePath);
    const jsonStat = await fs.stat(`${result.filePath}.json`);
    expect(archive.size).toBeGreaterThan(0);
    expect(jsonStat.size).toBeGreaterThan(0);

    // Cleanup the temp archive so the test run is hermetic.
    await fs.unlink(result.filePath);
    await fs.unlink(`${result.filePath}.json`);

    expect(harness.email.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        emailType: 'DATA_EXPORT_READY',
      }),
    );
  });
});
