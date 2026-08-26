import { BackupService } from './backup.service';
import { PrismaService } from '../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';

describe('BackupService', () => {
  let service: BackupService;
  let prisma: jest.Mocked<Partial<PrismaService>>;

  beforeEach(() => {
    prisma = {
      databaseBackup: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      } as any,
      backupScheduleConfig: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'default', enabled: false, cronExpression: '0 2 * * *',
          retentionCount: 10, lastRunAt: null,
        }),
        upsert: jest.fn().mockResolvedValue({}),
      } as any,
    };
    service = new BackupService(
      prisma as unknown as PrismaService,
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
      { sendNotification: jest.fn() } as unknown as NotificationsService,
    );
  });

  it('listBackups returns empty array when no backups exist', async () => {
    const result = await service.listBackups();
    expect(result).toEqual([]);
  });

  it('getBackupStatus returns totalBackups count', async () => {
    const result = await service.getBackupStatus();
    expect(result.totalBackups).toBe(0);
    expect(result.latestBackup).toBeNull();
  });

  it('getSchedule returns schedule config', async () => {
    const result = await service.getSchedule();
    expect(result.enabled).toBe(false);
    expect(result.cronExpression).toBe('0 2 * * *');
  });
});