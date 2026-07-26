jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn().mockImplementation(() => ({})) }));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BackupService } from '../../src/backup/backup.service';
import { PrismaService } from '../../src/database/prisma.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import * as childProcess from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';

jest.mock('child_process');
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    mkdirSync: jest.fn(() => undefined),
    existsSync: jest.fn(() => true),
    createReadStream: jest.fn(),
    promises: {
      stat: jest.fn(),
      unlink: jest.fn().mockResolvedValue(undefined),
    },
  };
});

describe('BackupService - PG dump & checksum', () => {
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
    user: { findMany: jest.fn() },
  } as any;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
        BACKUP_STORAGE_PATH: '/tmp/backups',
        PG_DUMP_PATH: '/usr/bin/pg_dump',
        PSQL_PATH: '/usr/bin/psql',
      };
      return values[key];
    }),
  } as any;

  const mockNotificationsService = {
    sendNotification: jest.fn(),
  } as any;

  const backupRecord = (overrides: Record<string, any> = {}) => ({
    id: 'backup-1',
    filename: 'propchain-manual-2026-01-01.sql',
    filePath: '/tmp/backups/propchain-manual-2026-01-01.sql',
    status: 'RUNNING',
    trigger: 'MANUAL',
    sizeBytes: null,
    checksum: null,
    startedAt: new Date(),
    completedAt: null,
    errorMessage: null,
    initiatedById: null,
    restoreStatus: 'IDLE',
    restoredAt: null,
    restoreError: null,
    restoredById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get(BackupService);

    mockPrismaService.backupScheduleConfig.upsert.mockResolvedValue({
      id: 'default', enabled: false, cronExpression: '0 2 * * *',
      retentionCount: 10, lastRunAt: null, createdAt: new Date(), updatedAt: new Date(),
    });
    mockPrismaService.backupScheduleConfig.findUnique.mockResolvedValue({
      id: 'default', enabled: false, cronExpression: '0 2 * * *',
      retentionCount: 10, lastRunAt: null, createdAt: new Date(), updatedAt: new Date(),
    });
  });

  it('should execute pg_dump with correct arguments', async () => {
    const mockExecFile = jest.spyOn(childProcess, 'execFile').mockImplementation(
      (_cmd: any, _args: any, cb: any) => {
        cb!(null, '', '');
        return {} as any;
      },
    );

    mockPrismaService.databaseBackup.count.mockResolvedValue(0);
    mockPrismaService.databaseBackup.create.mockResolvedValue(backupRecord());

    (fs.promises.stat as jest.Mock).mockResolvedValue({ size: 1024 });

    const readStream = {
      on: jest.fn((event: string, cb: any) => {
        if (event === 'data') cb(Buffer.from('dump content'));
        if (event === 'end') cb();
        return readStream;
      }),
    };
    (fs.createReadStream as jest.Mock).mockReturnValue(readStream);

    mockPrismaService.databaseBackup.update.mockResolvedValue(
      backupRecord({ status: 'COMPLETED', sizeBytes: BigInt(1024), checksum: 'abc123' }),
    );
    mockPrismaService.databaseBackup.findMany.mockResolvedValue([]);

    await service.createManualBackup('user-1');

    expect(mockExecFile).toHaveBeenCalledWith(
      '/usr/bin/pg_dump',
      expect.arrayContaining([
        expect.stringContaining('--dbname=postgresql://user:pass@localhost:5432/test'),
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '--format=plain',
        expect.stringContaining('--file='),
      ]),
      expect.any(Function),
    );
  });

  it('should compute SHA-256 checksum of the dump file', async () => {
    jest.spyOn(childProcess, 'execFile').mockImplementation(
      (_cmd: any, _args: any, cb: any) => {
        cb!(null, '', '');
        return {} as any;
      },
    );

    mockPrismaService.databaseBackup.count.mockResolvedValue(0);
    mockPrismaService.databaseBackup.create.mockResolvedValue(backupRecord());

    (fs.promises.stat as jest.Mock).mockResolvedValue({ size: 1024 });

    const dumpContent = 'CREATE TABLE test (id INT);';
    const expectedChecksum = crypto.createHash('sha256').update(dumpContent).digest('hex');

    const readStream = {
      on: jest.fn((event: string, cb: any) => {
        if (event === 'data') cb(Buffer.from(dumpContent));
        if (event === 'end') cb();
        return readStream;
      }),
    };
    (fs.createReadStream as jest.Mock).mockReturnValue(readStream);

    let capturedChecksum: string | undefined;
    mockPrismaService.databaseBackup.update.mockImplementation(async (args: any) => {
      if (args.data.checksum) capturedChecksum = args.data.checksum;
      return backupRecord({ status: 'COMPLETED', checksum: args.data.checksum || 'abc' });
    });
    mockPrismaService.databaseBackup.findMany.mockResolvedValue([]);

    await service.createManualBackup('user-1');

    expect(capturedChecksum).toBe(expectedChecksum);
  });

  it('should report failed status when pg_dump errors', async () => {
    const error = new Error('pg_dump: connection refused');
    jest.spyOn(childProcess, 'execFile').mockImplementation(
      (_cmd: any, _args: any, cb: any) => {
        cb!(error, '', '');
        return {} as any;
      },
    );

    mockPrismaService.databaseBackup.count.mockResolvedValue(0);
    mockPrismaService.databaseBackup.create.mockResolvedValue(backupRecord());
    mockPrismaService.databaseBackup.update.mockResolvedValue(
      backupRecord({ status: 'FAILED', errorMessage: 'pg_dump: connection refused' }),
    );

    await expect(service.createManualBackup('user-1')).rejects.toThrow('Backup creation failed');

    expect(mockPrismaService.databaseBackup.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });
});
