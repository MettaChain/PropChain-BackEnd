import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';
import { GetActivityLogsDto } from './dto/activity-log.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('users/activity-logs')
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get()
  getActivityLogs(@CurrentUser() user: any, @Query() filters: GetActivityLogsDto) {
    return this.activityLogService.findByUserId(user.id, filters);
  }
}

// Admin controller for viewing all activity logs
@UseGuards(JwtAuthGuard)
@Controller('admin/activity-logs')
export class AdminActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get()
  getAllActivityLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.activityLogService.findAllForAdmin(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      { userId, action, entityType, startDate, endDate },
    );
  }
}
