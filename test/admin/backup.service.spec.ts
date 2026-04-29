import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BackupStatus, BackupTrigger, RestoreStatus } from '@prisma/client';
import { BackupService } from '../../src/backup/backup.service';
import { PrismaService } from '../../src/database/prisma.service';

describe('BackupService', () => {
  let service: BackupService;

  const mockPrismaService = {
    databaseBackup: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    backupScheduleConfig: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  } as any;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        DATABASE_URL: 'postgresql://user:password@localhost:5432/propchain',
        BACKUP_STORAGE_PATH: 'C:/tmp/backups',
        PG_DUMP_PATH: 'pg_dump',
        PSQL_PATH: 'psql',
      };

      return values[key];
    }),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get(BackupService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns backup status with schedule details', async () => {
    mockPrismaService.databaseBackup.findFirst.mockResolvedValue({
      id: 'backup-1',
      filename: 'backup.sql',
      filePath: 'C:/tmp/backups/backup.sql',
      status: BackupStatus.COMPLETED,
      trigger: BackupTrigger.MANUAL,
      sizeBytes: BigInt(128),
      checksum: 'abc',
      startedAt: new Date('2026-04-25T08:00:00.000Z'),
      completedAt: new Date('2026-04-25T08:05:00.000Z'),
      errorMessage: null,
      initiatedById: 'user-1',
      restoreStatus: RestoreStatus.IDLE,
      restoredAt: null,
      restoreError: null,
      restoredById: null,
      createdAt: new Date('2026-04-25T08:00:00.000Z'),
      updatedAt: new Date('2026-04-25T08:05:00.000Z'),
    });
    mockPrismaService.databaseBackup.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(4);
    mockPrismaService.backupScheduleConfig.findUnique.mockResolvedValue({
      id: 'default',
      enabled: true,
      cronExpression: '0 2 * * *',
      retentionCount: 10,
      lastRunAt: new Date('2026-04-24T02:00:00.000Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const status = await service.getBackupStatus();

    expect(status.totalBackups).toBe(4);
    expect(status.runningBackups).toBe(0);
    expect(status.latestBackup?.sizeBytes).toBe(128);
    expect(status.schedule.enabled).toBe(true);
    expect(status.schedule.cronExpression).toBe('0 2 * * *');
  });

  it('rejects invalid cron expressions', async () => {
    await expect(
      service.updateSchedule({
        enabled: true,
        cronExpression: 'not-a-cron',
        retentionCount: 7,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks manual backup creation while another job is running', async () => {
    mockPrismaService.databaseBackup.count.mockResolvedValue(1);

    await expect(service.createManualBackup('user-1')).rejects.toBeInstanceOf(ConflictException);
  });
});
