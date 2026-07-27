// @ts-nocheck

import { Controller, Get, Post, Delete, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { AuthUserPayload } from '../../auth/types/auth-user.type';
import { UserRole } from '../../types/prisma.types';
import { QueueMonitoringService } from './queue.service';

@ApiTags('Admin - Queue Monitoring')
@Controller('admin/queues')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class QueueController {
  constructor(private readonly queueService: QueueMonitoringService) {}

  @Get()
  @ApiOperation({ summary: 'List all queues with job counts' })
  listQueues() {
    return this.queueService.getAllQueues();
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get queue depth metrics for monitoring' })
  getMetrics() {
    return this.queueService.getQueueMetrics();
  }

  @Get(':name/failed')
  @ApiOperation({ summary: 'List failed jobs in a queue' })
  getFailedJobs(@Param('name') name: string) {
    return this.queueService.getFailedJobs(name);
  }

  @Post(':name/jobs/:jobId/retry')
  @ApiOperation({ summary: 'Retry a failed job' })
  retryJob(@Param('name') name: string, @Param('jobId') jobId: string) {
    return this.queueService.retryJob(name, jobId);
  }

  @Post(':name/failed/retry-all')
  @ApiOperation({ summary: 'Retry all failed jobs in a queue' })
  retryAllFailed(@Param('name') name: string) {
    return this.queueService.retryAllFailedJobs(name);
  }

  @Delete(':name/jobs/:jobId')
  @ApiOperation({ summary: 'Remove a job from a queue' })
  removeJob(@Param('name') name: string, @Param('jobId') jobId: string) {
    return this.queueService.removeJob(name, jobId);
  }
}
