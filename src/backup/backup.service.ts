import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BackupStatus,
  BackupTrigger,
  DatabaseBackup,
  RestoreStatus,
} from '@prisma/client';
import { CronJob } from 'cron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { PrismaService } from '../database/prisma.service';
import { UpdateBackupScheduleDto } from './dto/backup.dto';

const execFileAsync = promisify(execFile);
const DEFAULT_SCHEDULE_ID = 'default';

@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);
  private scheduledJob?: CronJob;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ensureScheduleConfig();
    await this.refreshSchedule();
  }

  async listBackups() {
    const backups = await this.prisma.databaseBackup.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        initiatedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        restoredBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    return backups.map((backup) => this.serializeBackup(backup));
  }

  async getBackupStatus() {
    const [latestBackup, runningBackups, totalBackups, schedule] = await Promise.all([
      this.prisma.databaseBackup.findFirst({
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.databaseBackup.count({
        where: {
          OR: [{ status: BackupStatus.RUNNING }, { restoreStatus: RestoreStatus.RUNNING }],
        },
      }),
      this.prisma.databaseBackup.count(),
      this.getScheduleConfig(),
    ]);

    return {
      totalBackups,
      runningBackups,
      latestBackup: latestBackup ? this.serializeBackup(latestBackup) : null,
      schedule: this.serializeSchedule(schedule),
    };
  }

  async getSchedule() {
    const schedule = await this.getScheduleConfig();
    return this.serializeSchedule(schedule);
  }

  async updateSchedule(payload: UpdateBackupScheduleDto) {
    this.assertValidCronExpression(payload.cronExpression);

    const schedule = await this.prisma.backupScheduleConfig.upsert({
      where: { id: DEFAULT_SCHEDULE_ID },
      update: {
        enabled: payload.enabled,
        cronExpression: payload.cronExpression,
        retentionCount: payload.retentionCount,
      },
      create: {
        id: DEFAULT_SCHEDULE_ID,
        enabled: payload.enabled,
        cronExpression: payload.cronExpression,
        retentionCount: payload.retentionCount ?? 10,
      },
    });

    await this.refreshSchedule();
    return this.serializeSchedule(schedule);
  }

  async createManualBackup(initiatedById?: string) {
    return this.createBackup(BackupTrigger.MANUAL, initiatedById);
  }

  async restoreBackup(backupId: string, restoredById?: string) {
    const backup = await this.prisma.databaseBackup.findUnique({
      where: { id: backupId },
    });

    if (!backup) {
      throw new NotFoundException('Backup not found');
    }

    if (!fs.existsSync(backup.filePath)) {
      throw new NotFoundException('Backup file is missing from storage');
    }

    await this.ensureNoActiveJobs(backupId);

    await this.prisma.databaseBackup.update({
      where: { id: backupId },
      data: {
        restoreStatus: RestoreStatus.RUNNING,
        restoreError: null,
        restoredById: restoredById ?? null,
      },
    });

    try {
      await this.runRestoreCommand(backup.filePath);

      const restored = await this.prisma.databaseBackup.update({
        where: { id: backupId },
        data: {
          restoreStatus: RestoreStatus.COMPLETED,
          restoredAt: new Date(),
          restoreError: null,
          restoredById: restoredById ?? null,
        },
      });

      return this.serializeBackup(restored);
    } catch (error) {
      const message = this.toErrorMessage(error);

      await this.prisma.databaseBackup.update({
        where: { id: backupId },
        data: {
          restoreStatus: RestoreStatus.FAILED,
          restoreError: message,
          restoredById: restoredById ?? null,
        },
      });

      throw new InternalServerErrorException(`Backup restore failed: ${message}`);
    }
  }

  async getBackupFile(backupId: string) {
    const backup = await this.prisma.databaseBackup.findUnique({
      where: { id: backupId },
    });

    if (!backup) {
      throw new NotFoundException('Backup not found');
    }

    if (!fs.existsSync(backup.filePath)) {
      throw new NotFoundException('Backup file is missing from storage');
    }

    return {
      backup: this.serializeBackup(backup),
      filePath: backup.filePath,
      filename: backup.filename,
    };
  }

  private async createBackup(trigger: BackupTrigger, initiatedById?: string) {
    await this.ensureNoActiveJobs();
    this.ensureDatabaseUrl();

    const storagePath = this.getStoragePath();
    fs.mkdirSync(storagePath, { recursive: true });

    const filename = this.buildFilename(trigger);
    const filePath = path.join(storagePath, filename);

    const backup = await this.prisma.databaseBackup.create({
      data: {
        filename,
        filePath,
        status: BackupStatus.RUNNING,
        trigger,
        initiatedById: initiatedById ?? null,
      },
    });

    try {
      await this.runBackupCommand(filePath);

      const stats = await fs.promises.stat(filePath);
      const checksum = await this.computeChecksum(filePath);

      const completed = await this.prisma.databaseBackup.update({
        where: { id: backup.id },
        data: {
          status: BackupStatus.COMPLETED,
          completedAt: new Date(),
          sizeBytes: BigInt(stats.size),
          checksum,
          errorMessage: null,
        },
      });

      if (trigger === BackupTrigger.SCHEDULED) {
        await this.prisma.backupScheduleConfig.update({
          where: { id: DEFAULT_SCHEDULE_ID },
          data: { lastRunAt: new Date() },
        });
      }

      await this.enforceRetentionPolicy();
      return this.serializeBackup(completed);
    } catch (error) {
      const message = this.toErrorMessage(error);

      await this.prisma.databaseBackup.update({
        where: { id: backup.id },
        data: {
          status: BackupStatus.FAILED,
          completedAt: new Date(),
          errorMessage: message,
        },
      });

      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath).catch(() => undefined);
      }

      throw new InternalServerErrorException(`Backup creation failed: ${message}`);
    }
  }

  private async refreshSchedule() {
    if (this.scheduledJob) {
      this.scheduledJob.stop();
      this.scheduledJob = undefined;
    }

    const schedule = await this.getScheduleConfig();
    if (!schedule.enabled) {
      return;
    }

    this.assertValidCronExpression(schedule.cronExpression);

    this.scheduledJob = new CronJob(schedule.cronExpression, async () => {
      try {
        await this.createBackup(BackupTrigger.SCHEDULED);
      } catch (error) {
        this.logger.error(`Scheduled backup failed: ${this.toErrorMessage(error)}`);
      }
    });

    this.scheduledJob.start();
  }

  private async ensureScheduleConfig() {
    await this.prisma.backupScheduleConfig.upsert({
      where: { id: DEFAULT_SCHEDULE_ID },
      update: {},
      create: {
        id: DEFAULT_SCHEDULE_ID,
        enabled: false,
        cronExpression: '0 2 * * *',
        retentionCount: 10,
      },
    });
  }

  private async getScheduleConfig() {
    const schedule = await this.prisma.backupScheduleConfig.findUnique({
      where: { id: DEFAULT_SCHEDULE_ID },
    });

    if (!schedule) {
      throw new NotFoundException('Backup schedule configuration not found');
    }

    return schedule;
  }

  private async enforceRetentionPolicy() {
    const schedule = await this.getScheduleConfig();
    const backups = await this.prisma.databaseBackup.findMany({
      where: { status: BackupStatus.COMPLETED },
      orderBy: { createdAt: 'desc' },
      skip: schedule.retentionCount,
    });

    await Promise.all(
      backups.map(async (backup) => {
        if (fs.existsSync(backup.filePath)) {
          await fs.promises.unlink(backup.filePath).catch(() => undefined);
        }

        await this.prisma.databaseBackup.delete({ where: { id: backup.id } });
      }),
    );
  }

  private async ensureNoActiveJobs(excludedBackupId?: string) {
    const activeJobs = await this.prisma.databaseBackup.count({
      where: {
        id: excludedBackupId ? { not: excludedBackupId } : undefined,
        OR: [{ status: BackupStatus.RUNNING }, { restoreStatus: RestoreStatus.RUNNING }],
      },
    });

    if (activeJobs > 0) {
      throw new ConflictException('A backup or restore job is already running');
    }
  }

  private buildFilename(trigger: BackupTrigger) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `propchain-${trigger.toLowerCase()}-${timestamp}.sql`;
  }

  private getStoragePath() {
    return this.configService.get<string>('BACKUP_STORAGE_PATH') ?? path.join(process.cwd(), 'backups');
  }

  private ensureDatabaseUrl() {
    if (!this.configService.get<string>('DATABASE_URL')) {
      throw new BadRequestException('DATABASE_URL is not configured');
    }
  }

  private getBackupCommand() {
    return this.configService.get<string>('PG_DUMP_PATH') ?? 'pg_dump';
  }

  private getRestoreCommand() {
    return this.configService.get<string>('PSQL_PATH') ?? 'psql';
  }

  private async runBackupCommand(filePath: string) {
    await execFileAsync(this.getBackupCommand(), [
      `--dbname=${this.configService.get<string>('DATABASE_URL')}`,
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--format=plain',
      `--file=${filePath}`,
    ]);
  }

  private async runRestoreCommand(filePath: string) {
    await execFileAsync(this.getRestoreCommand(), [
      `--dbname=${this.configService.get<string>('DATABASE_URL')}`,
      '--single-transaction',
      '--file',
      filePath,
    ]);
  }

  private async computeChecksum(filePath: string) {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve());
      stream.on('error', reject);
    });

    return hash.digest('hex');
  }

  private assertValidCronExpression(expression: string) {
    try {
      const job = new CronJob(expression, () => undefined);
      job.stop();
    } catch (error) {
      throw new BadRequestException(`Invalid cron expression: ${this.toErrorMessage(error)}`);
    }
  }

  private serializeSchedule(schedule: {
    enabled: boolean;
    cronExpression: string;
    retentionCount: number;
    lastRunAt: Date | null;
  }) {
    let nextRunAt: Date | null = null;

    if (schedule.enabled) {
      try {
        nextRunAt = new CronJob(schedule.cronExpression, () => undefined).nextDate().toJSDate();
      } catch (error) {
        this.logger.warn(`Could not calculate next run: ${this.toErrorMessage(error)}`);
      }
    }

    return {
      enabled: schedule.enabled,
      cronExpression: schedule.cronExpression,
      retentionCount: schedule.retentionCount,
      lastRunAt: schedule.lastRunAt,
      nextRunAt,
    };
  }

  private serializeBackup(backup: DatabaseBackup) {
    return {
      ...backup,
      sizeBytes: backup.sizeBytes ? Number(backup.sizeBytes) : null,
    };
  }

  private toErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown error';
  }
}
