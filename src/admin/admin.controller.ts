import * as fs from 'fs';
import * as path from 'path';
import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { UserRole } from '../types/prisma.types';
import { AdminService } from './admin.service';
import { EmailService } from '../email/email.service';
import {
  AddFraudInvestigationNoteDto,
  AdminUpdateUserDto,
  AdminUsersQueryDto,
  BlockFraudUserDto,
  BulkModerationDto,
  FlagPropertyDto,
  FraudAlertsQueryDto,
  ModerationQueueQueryDto,
  ReviewFraudAlertDto,
  TransactionMonitoringQueryDto,
  UpdateTransactionStatusDto,
} from './dto/admin.dto';
import { RestoreBackupDto, UpdateBackupScheduleDto } from '../backup/dto/backup.dto';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
// Issue #919 – Data archival strategy
import { ArchiveService } from '../archive/archive.service';
// Issue #920 – Cleanup service
import { CleanupService } from '../database/cleanup.service';

@ApiTags('Admin')
@ApiBearerAuth('access-token')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@UseInterceptors(AdminAuditInterceptor)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly emailService: EmailService,
    private readonly archiveService: ArchiveService,
    private readonly cleanupService: CleanupService,
  ) {}

  @Get('dashboard')
  getDashboard(): ReturnType<AdminService['getDashboard']> {
    return this.adminService.getDashboard();
  }

  @Get('backups')
  listBackups(): ReturnType<AdminService['listBackups']> {
    return this.adminService.listBackups();
  }

  @Get('backups/status')
  getBackupStatus(): ReturnType<AdminService['getBackupStatus']> {
    return this.adminService.getBackupStatus();
  }

  @Get('backups/schedule')
  getBackupSchedule(): ReturnType<AdminService['getBackupSchedule']> {
    return this.adminService.getBackupSchedule();
  }

  @Put('backups/schedule')
  updateBackupSchedule(
    @Body() payload: UpdateBackupScheduleDto,
  ): ReturnType<AdminService['updateBackupSchedule']> {
    return this.adminService.updateBackupSchedule(payload);
  }

  @Post('backups/run')
  runBackup(@CurrentUser() user: AuthUserPayload): ReturnType<AdminService['runBackup']> {
    return this.adminService.runBackup(user.sub);
  }

  @Post('backups/:id/restore')
  restoreBackup(
    @Param('id') backupId: string,
    @Body() _payload: RestoreBackupDto,
    @CurrentUser() user: AuthUserPayload,
  ): ReturnType<AdminService['restoreBackup']> {
    return this.adminService.restoreBackup(backupId, user.sub);
  }

  @Get('backups/:id/download')
  async downloadBackup(@Param('id') backupId: string, @Res() res: Response): Promise<void> {
    const file = await this.adminService.getBackupDownload(backupId);
    res.download(file.filePath, file.filename);
  }

  @Get('users')
  listUsers(@Query() query: AdminUsersQueryDto): ReturnType<AdminService['listUsers']> {
    return this.adminService.listUsers(query);
  }

  @Patch('users/:id')
  updateUser(
    @Param('id') userId: string,
    @Body() payload: AdminUpdateUserDto,
  ): ReturnType<AdminService['updateUser']> {
    return this.adminService.updateUser(userId, payload);
  }

  @Post('users/:id/block')
  blockUser(@Param('id') userId: string): ReturnType<AdminService['setUserBlockedState']> {
    return this.adminService.setUserBlockedState(userId, true);
  }

  @Post('users/:id/unblock')
  unblockUser(@Param('id') userId: string): ReturnType<AdminService['setUserBlockedState']> {
    return this.adminService.setUserBlockedState(userId, false);
  }

  @Get('properties/moderation/queue')
  getModerationQueue(
    @Query() query: ModerationQueueQueryDto,
  ): ReturnType<AdminService['getModerationQueue']> {
    return this.adminService.getModerationQueue(query);
  }

  @Post('properties/:id/approve')
  approveProperty(@Param('id') propertyId: string): ReturnType<AdminService['approveProperty']> {
    return this.adminService.approveProperty(propertyId);
  }

  @Post('properties/:id/reject')
  rejectProperty(@Param('id') propertyId: string): ReturnType<AdminService['rejectProperty']> {
    return this.adminService.rejectProperty(propertyId);
  }

  @Post('properties/:id/flag')
  flagProperty(
    @Param('id') propertyId: string,
    @Body() body: FlagPropertyDto,
  ): ReturnType<AdminService['flagProperty']> {
    return this.adminService.flagProperty(propertyId, body.reason);
  }

  @Post('properties/moderation/bulk')
  bulkModerate(
    @Body() body: BulkModerationDto,
    @CurrentUser() _user: AuthUserPayload,
  ): ReturnType<AdminService['bulkModerate']> {
    return this.adminService.bulkModerate(body);
  }

  @Get('transactions/monitoring')
  monitorTransactions(
    @Query() query: TransactionMonitoringQueryDto,
  ): ReturnType<AdminService['monitorTransactions']> {
    return this.adminService.monitorTransactions(query);
  }

  @Get('transactions/monitoring/summary')
  monitorTransactionsSummary(): ReturnType<AdminService['transactionMonitoringSummary']> {
    return this.adminService.transactionMonitoringSummary();
  }

  @Patch('transactions/:id/status')
  updateTransactionStatus(
    @Param('id') transactionId: string,
    @Body() payload: UpdateTransactionStatusDto,
    @CurrentUser() user: AuthUserPayload,
  ): ReturnType<AdminService['updateTransactionStatus']> {
    return this.adminService.updateTransactionStatus(transactionId, payload, user.sub);
  }

  @ApiTags('Fraud')
  @Get('fraud/alerts')
  listFraudAlerts(
    @Query() query: FraudAlertsQueryDto,
  ): ReturnType<AdminService['listFraudAlerts']> {
    return this.adminService.listFraudAlerts(query);
  }

  @ApiTags('Fraud')
  @Get('fraud/alerts/summary')
  getFraudAlertsSummary(): ReturnType<AdminService['getFraudAlertsSummary']> {
    return this.adminService.getFraudAlertsSummary();
  }

  @ApiTags('Fraud')
  @Get('fraud/alerts/:id')
  getFraudAlertDetails(
    @Param('id') alertId: string,
  ): ReturnType<AdminService['getFraudAlertDetails']> {
    return this.adminService.getFraudAlertDetails(alertId);
  }

  @ApiTags('Fraud')
  @Patch('fraud/alerts/:id')
  reviewFraudAlert(
    @Param('id') alertId: string,
    @Body() payload: ReviewFraudAlertDto,
    @CurrentUser() user: AuthUserPayload,
  ): ReturnType<AdminService['reviewFraudAlert']> {
    return this.adminService.reviewFraudAlert(alertId, payload, user.sub);
  }

  @ApiTags('Fraud')
  @Post('fraud/alerts/:id/notes')
  addFraudAlertNote(
    @Param('id') alertId: string,
    @Body() payload: AddFraudInvestigationNoteDto,
    @CurrentUser() user: AuthUserPayload,
  ): ReturnType<AdminService['addFraudAlertNote']> {
    return this.adminService.addFraudAlertNote(alertId, payload, user.sub);
  }

  @ApiTags('Fraud')
  @Post('fraud/alerts/:id/block-user')
  blockFraudUser(
    @Param('id') alertId: string,
    @Body() payload: BlockFraudUserDto,
    @CurrentUser() user: AuthUserPayload,
  ): ReturnType<AdminService['blockFraudUser']> {
    return this.adminService.blockFraudUser(alertId, user.sub, payload);
  }

  @ApiTags('Fraud')
  @Post('fraud/users/:id/scan')
  scanUserForFraud(
    @Param('id') userId: string,
    @CurrentUser() user: AuthUserPayload,
  ): ReturnType<AdminService['scanUserForFraud']> {
    return this.adminService.scanUserForFraud(userId, user.sub);
  }

  @ApiTags('Fraud')
  @Post('fraud/properties/:id/scan')
  scanPropertyForFraud(
    @Param('id') propertyId: string,
    @CurrentUser() user: AuthUserPayload,
  ): ReturnType<AdminService['scanPropertyForFraud']> {
    return this.adminService.scanPropertyForFraud(propertyId, user.sub);
  }

  @Get('email/preview/:templateName')
  async previewEmailTemplate(@Param('templateName') templateName: string): Promise<{
    templateName: string;
    sampleData: Record<string, unknown>;
    note: string;
  }> {
    const sampleDataMap: Record<string, Record<string, unknown>> = {
      'password-reset': {
        resetUrl: 'http://localhost:3000/reset-password?token=sample-token-123',
      },
      'account-locked': {
        lockoutDuration: 30,
      },
      'fraud-alert': {
        alertId: 'fraud-alert-123',
        pattern: 'EXCESSIVE_FAILED_LOGINS',
        severity: 'HIGH',
        userEmail: 'user@example.com',
        description: 'The account recorded 10 failed login attempts in the last 30 minutes.',
      },
      'transaction-status-pending': {
        transactionId: 'txn-123',
        propertyTitle: 'Modern Downtown Apartment',
        propertyAddress: '123 Main St, New York, NY 10001',
        buyerName: 'John Doe',
        sellerName: 'Jane Smith',
        amount: '$500,000',
        status: 'PENDING',
      },
      'transaction-status-completed': {
        transactionId: 'txn-123',
        propertyTitle: 'Modern Downtown Apartment',
        propertyAddress: '123 Main St, New York, NY 10001',
        buyerName: 'John Doe',
        sellerName: 'Jane Smith',
        amount: '$500,000',
        completionDate: 'January 15, 2026',
        blockchainTxHash: '0xabc123...xyz789',
      },
      'transaction-status-cancelled': {
        transactionId: 'txn-123',
        propertyTitle: 'Modern Downtown Apartment',
        propertyAddress: '123 Main St, New York, NY 10001',
        buyerName: 'John Doe',
        sellerName: 'Jane Smith',
        amount: '$500,000',
        cancellationReason: 'Mutual agreement between parties',
        cancelledDate: 'January 10, 2026',
      },
    };

    const sampleData = sampleDataMap[templateName];
    if (!sampleData) {
      throw new HttpException(
        `Template '${templateName}' not found. Available templates: ${Object.keys(sampleDataMap).join(', ')}`,
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      templateName,
      sampleData,
      note: 'This is a preview with sample data. Actual emails will use real data.',
    };
  }

  @Delete('exports/:filename')
  deleteExport(@Param('filename') filename: string): { message: string } {
    const filepath = path.join(process.cwd(), 'exports', filename);

    if (!fs.existsSync(filepath)) {
      throw new NotFoundException('Export file not found');
    }

    fs.unlinkSync(filepath);

    return { message: 'Export file deleted successfully' };
  }

  // ── Archive endpoints (Issue #919) ─────────────────────────────────────────

  @ApiOperation({ summary: 'List all archive files' })
  @Get('archive/files')
  listArchiveFiles(): ReturnType<ArchiveService['listArchiveFiles']> {
    return this.archiveService.listArchiveFiles();
  }

  @ApiOperation({ summary: 'Get status of last archival run' })
  @Get('archive/status')
  getArchiveStatus(): ReturnType<ArchiveService['getLastSummary']> {
    return this.archiveService.getLastSummary();
  }

  @ApiOperation({ summary: 'Trigger a manual archival run' })
  @Post('archive/run')
  async runArchival(): Promise<ReturnType<ArchiveService['runArchival']>> {
    return this.archiveService.runArchival();
  }

  @ApiOperation({ summary: 'Restore records from an archive file' })
  @Post('archive/restore')
  async restoreArchive(
    @Body() body: { archiveFile: string },
  ): Promise<{ restored: number; errors: string[] }> {
    return this.archiveService.restoreFromArchive(body.archiveFile);
  }

  // ── Cleanup endpoints (Issue #920) ─────────────────────────────────────────

  @ApiOperation({ summary: 'Get status of last cleanup run' })
  @Get('cleanup/status')
  getCleanupStatus(): ReturnType<CleanupService['getLastSummary']> {
    return this.cleanupService.getLastSummary();
  }

  @ApiOperation({ summary: 'Trigger a manual cleanup of expired records' })
  @Post('cleanup/run')
  async runCleanup(): Promise<ReturnType<CleanupService['performCleanup']>> {
    return this.cleanupService.performCleanup();
  }
}
