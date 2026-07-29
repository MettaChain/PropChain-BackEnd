import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  GoneException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { UserRole } from '../types/prisma.types';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { ActivityLogService } from './activity-log.service';
import {
  CreateUserDto,
  SearchUsersDto,
  UpdatePreferencesDto,
  UpdateUserDto,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  UpdateUserProfileDto,
} from './dto/user.dto';
import { DeactivateAccountDto, ReactivateAccountDto } from './dto/deactivation.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { RequestAccountDeletionDto } from './dto/account-deletion.dto';
import { AccountDeletionService, DeletionJobResult } from './account-deletion.service';
import { DataExportService, ExportResult } from './data-export.service';

const UNAUTHORIZED_ACTION_MESSAGE = 'You are not authorized to perform this action';
const REACTIVATE_LIMIT = 5;
const REACTIVATE_WINDOW_MS = 60 * 60 * 1000;

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  private readonly downloadRateLimitMap = new Map<string, { count: number; resetAt: number }>();
  private readonly reactivateRateLimitMap = new Map<string, { count: number; resetAt: number }>();
  private static readonly DOWNLOAD_LIMIT = 10;
  private static readonly DOWNLOAD_WINDOW_MS = 60 * 60 * 1000;

  constructor(
    private readonly usersService: UsersService,
    private readonly activityLogService: ActivityLogService,
    private readonly accountDeletionService: AccountDeletionService,
    private readonly dataExportService: DataExportService,
  ) {}

  // ─── Issue #960 — Account Deletion Workflow (self-service) ─────────────────

  @UseGuards(JwtAuthGuard)
  @Post('me/request-deletion')
  async requestAccountDeletion(
    @CurrentUser() user: AuthUserPayload,
    @Body() body: RequestAccountDeletionDto,
  ): Promise<{
    userId: string;
    isDeactivated: boolean;
    scheduledDeletionAt: Date;
    retentionDays: number;
  }> {
    return this.accountDeletionService.requestDeletion({
      userId: user.sub,
      actorId: user.sub,
      retentionDays: body?.retentionDays,
      reason: body?.reason ?? null,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/cancel-deletion')
  async cancelAccountDeletion(
    @CurrentUser() user: AuthUserPayload,
  ): Promise<{ userId: string; isDeactivated: boolean; scheduledDeletionAt: Date | null }> {
    return this.accountDeletionService.cancelDeletion({
      userId: user.sub,
      actorId: user.sub,
    });
  }

  // ─── Issue #959 — GDPR Personal Data Export (self-service) ──────────────────

  @UseGuards(JwtAuthGuard)
  @Post('me/request-export')
  async requestPersonalDataExport(@CurrentUser() user: AuthUserPayload): Promise<ExportResult> {
    return this.dataExportService.exportPersonalData({
      userId: user.sub,
      actorId: user.sub,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/exports/:jobId/stream')
  async streamExportArchive(
    @Param('jobId') jobId: string,
    @CurrentUser() _user: AuthUserPayload,
  ): Promise<StreamableFile> {
    const stream = await this.dataExportService.streamExportArchive(jobId);
    return new StreamableFile(stream, {
      type: 'application/zip',
      disposition: `attachment; filename="propchain-export-${jobId}.zip"`,
    });
  }

  // ─── Admin Endpoints ─────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('search')
  search(@Query() query: SearchUsersDto) {
    return this.usersService.search(query);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/statistics')
  getStatistics(@CurrentUser() user: AuthUserPayload) {
    return this.usersService.getUserStatistics(user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Put(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/block')
  block(@Param('id') id: string) {
    return this.usersService.block(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/unblock')
  unblock(@Param('id') id: string) {
    return this.usersService.unblock(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  // ─── Profile Management (#306) ───────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('me/profile')
  getProfile(@CurrentUser() user: AuthUserPayload) {
    return this.usersService.getProfile(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Put('me/profile')
  updateProfile(@CurrentUser() user: AuthUserPayload, @Body() updateProfileDto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.sub, updateProfileDto);
  }

  // ─── User Self-Service ───────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post(':id/export')
  async exportData(@Param('id') id: string, @CurrentUser() user: AuthUserPayload) {
    if (user.sub !== id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(UNAUTHORIZED_ACTION_MESSAGE);
    }

    try {
      const exportData = await this.usersService.exportPersonalData(id);
      const exportsDir = path.join(process.cwd(), 'exports');
      fs.mkdirSync(exportsDir, { recursive: true });

      const filename = `export-${id}-${crypto.randomUUID()}.json`;
      const filepath = path.join(exportsDir, filename);

      fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2));

      return {
        message: 'Export generated successfully',
        downloadLink: `/users/export/download/${filename}`,
        expiresIn: '24 hours',
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'User not found') {
        throw new NotFoundException(error.message);
      }

      throw new InternalServerErrorException('Failed to generate export');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('export/download/:filename')
  async downloadExport(
    @Param('filename') filename: string,
    @Res() res: Response,
    @CurrentUser() user: AuthUserPayload,
  ) {
    const now = Date.now();
    const entry = this.downloadRateLimitMap.get(user.sub);
    if (entry && now < entry.resetAt) {
      if (entry.count >= UsersController.DOWNLOAD_LIMIT) {
        throw new HttpException(
          'Too many export downloads. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      entry.count++;
    } else {
      this.downloadRateLimitMap.set(user.sub, {
        count: 1,
        resetAt: now + UsersController.DOWNLOAD_WINDOW_MS,
      });
    }

    const filepath = path.join(process.cwd(), 'exports', filename);

    if (!fs.existsSync(filepath)) {
      throw new NotFoundException('Export file not found');
    }

    const stats = fs.statSync(filepath);
    const expirationTime = 24 * 60 * 60 * 1000;
    if (Date.now() - stats.mtimeMs > expirationTime) {
      throw new GoneException('Export file has expired');
    }

    const ownerId = this.extractExportOwnerId(filename);

    if (user.sub !== ownerId && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(UNAUTHORIZED_ACTION_MESSAGE);
    }

    this.activityLogService.create(user.sub, {
      action: 'EXPORT_DOWNLOAD',
      entityType: 'USER',
      entityId: ownerId,
      description: `Downloaded export file: ${filename}`,
      metadata: { filename, ownerId },
    });

    res.download(filepath, (err) => {
      if (err && !res.headersSent) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
          message: 'Error downloading file',
          error: err.message,
        });
      }
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/deactivate')
  deactivateAccount(
    @CurrentUser() user: AuthUserPayload,
    @Body() deactivateDto: DeactivateAccountDto,
  ) {
    return this.usersService.deactivate(user.sub, deactivateDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/request-reactivation')
  requestReactivation(@CurrentUser() user: AuthUserPayload) {
    return this.usersService.requestReactivation(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/reactivate')
  reactivateAccount(
    @CurrentUser() user: AuthUserPayload,
    @Body() reactivateDto: ReactivateAccountDto,
  ) {
    const emailLower = user.email.toLowerCase();
    const now = Date.now();
    const entry = this.reactivateRateLimitMap.get(emailLower);

    if (entry && now < entry.resetAt) {
      if (entry.count >= REACTIVATE_LIMIT) {
        throw new HttpException(
          'Too many reactivation attempts. Try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      entry.count++;
    } else {
      this.reactivateRateLimitMap.set(emailLower, {
        count: 1,
        resetAt: now + REACTIVATE_WINDOW_MS,
      });
    }

    return this.usersService.reactivate(user.sub, reactivateDto);
  }

  // ─── Admin Verification ────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/verify')
  verifyUser(@Param('id') id: string) {
    return this.usersService.verify(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/unverify')
  unverifyUser(@Param('id') id: string) {
    return this.usersService.unverify(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/deactivate')
  adminDeactivateAccount(@Param('id') id: string, @Body() deactivateDto: DeactivateAccountDto) {
    return this.usersService.deactivate(id, deactivateDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/reactivate')
  adminReactivateAccount(@Param('id') id: string, @Body() reactivateDto: ReactivateAccountDto) {
    return this.usersService.reactivate(id, reactivateDto);
  }

  // ─── Preferences & Referrals ────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Put('me/preferences')
  updatePreferences(
    @CurrentUser() user: AuthUserPayload,
    @Body() updatePreferencesDto: UpdatePreferencesDto,
  ) {
    return this.usersService.updatePreferences(user.sub, updatePreferencesDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/referral-stats')
  getReferralStats(@CurrentUser() user: AuthUserPayload) {
    return this.usersService.getReferralStats(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/referrals')
  getMyReferrals(@CurrentUser() user: AuthUserPayload) {
    return this.usersService.getMyReferrals(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/login-history')
  getLoginHistory(@CurrentUser() user: AuthUserPayload) {
    return this.usersService.getLoginHistory(user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('scheduled-deletion')
  getScheduledForDeletion() {
    return this.usersService.findScheduledForDeletion();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('delete-scheduled')
  deleteScheduledUsers(): Promise<DeletionJobResult> {
    return this.accountDeletionService.performScheduledDeletion();
  }

  private extractExportOwnerId(filename: string) {
    const match =
      /^export-(.+)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/i.exec(
        filename,
      );

    if (!match) {
      throw new NotFoundException('Invalid export file');
    }

    return match[1];
  }
}
