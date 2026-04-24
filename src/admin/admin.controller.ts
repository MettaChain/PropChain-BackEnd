import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { UserRole } from '../types/prisma.types';
import { AdminService } from './admin.service';
import {
  AdminUpdateUserDto,
  AdminUsersQueryDto,
  BulkModerationDto,
  FlagPropertyDto,
  ModerationQueueQueryDto,
  TransactionMonitoringQueryDto,
} from './dto/admin.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('users')
  listUsers(@Query() query: AdminUsersQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Patch('users/:id')
  updateUser(@Param('id') userId: string, @Body() payload: AdminUpdateUserDto) {
    return this.adminService.updateUser(userId, payload);
  }

  @Post('users/:id/block')
  blockUser(@Param('id') userId: string) {
    return this.adminService.setUserBlockedState(userId, true);
  }

  @Post('users/:id/unblock')
  unblockUser(@Param('id') userId: string) {
    return this.adminService.setUserBlockedState(userId, false);
  }

  @Get('properties/moderation/queue')
  getModerationQueue(@Query() query: ModerationQueueQueryDto) {
    return this.adminService.getModerationQueue(query);
  }

  @Post('properties/:id/approve')
  approveProperty(@Param('id') propertyId: string) {
    return this.adminService.approveProperty(propertyId);
  }

  @Post('properties/:id/reject')
  rejectProperty(@Param('id') propertyId: string) {
    return this.adminService.rejectProperty(propertyId);
  }

  @Post('properties/:id/flag')
  flagProperty(@Param('id') propertyId: string, @Body() body: FlagPropertyDto) {
    return this.adminService.flagProperty(propertyId, body.reason);
  }

  @Post('properties/moderation/bulk')
  bulkModerate(@Body() body: BulkModerationDto, @CurrentUser() _user: AuthUserPayload) {
    return this.adminService.bulkModerate(body);
  }

  @Get('transactions/monitoring')
  monitorTransactions(@Query() query: TransactionMonitoringQueryDto) {
    return this.adminService.monitorTransactions(query);
  }

  @Get('transactions/monitoring/summary')
  monitorTransactionsSummary() {
    return this.adminService.transactionMonitoringSummary();
  }
}
