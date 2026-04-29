import { Controller, Post, Patch, Get, Body, Param, UseGuards } from '@nestjs/common';
import { TimelineService } from './timeline.service';
import { CreateMilestoneDto, UpdateMilestoneDto } from './dto/timeline.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Transaction Timeline')
@ApiBearerAuth()
@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TimelineController {
  constructor(private readonly timelineService: TimelineService) {}

  @Post(':id/timeline')
  @ApiOperation({ summary: 'Add a milestone to the transaction timeline' })
  @ApiResponse({ status: 201, description: 'Milestone added successfully' })
  addMilestone(
    @Param('id') id: string,
    @Body() dto: CreateMilestoneDto,
  ) {
    return this.timelineService.addMilestone(id, dto);
  }

  @Patch('timeline/:milestoneId')
  @ApiOperation({ summary: 'Update a milestone status or date' })
  @ApiResponse({ status: 200, description: 'Milestone updated successfully' })
  updateMilestone(
    @Param('milestoneId') milestoneId: string,
    @Body() dto: UpdateMilestoneDto,
  ) {
    return this.timelineService.updateMilestone(milestoneId, dto);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get the visual timeline for a transaction' })
  @ApiResponse({ status: 200, description: 'Timeline details returned successfully' })
  getTimeline(@Param('id') id: string) {
    return this.timelineService.getTimeline(id);
  }
}
