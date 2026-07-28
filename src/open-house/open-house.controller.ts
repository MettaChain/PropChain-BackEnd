// @ts-nocheck

import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { OpenHouseService } from './open-house.service';
import { CreateOpenHouseDto } from './dto/create-open-house.dto';
import { RsvpOpenHouseDto } from './dto/rsvp-open-house.dto';
import {
  CreateTourRequestDto,
  UpdateTourRequestStatusDto,
  CreateAgentAvailabilityDto,
} from './dto/tour-request.dto';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('open-house')
@Controller('open-house')
export class OpenHouseController {
  constructor(private readonly openHouseService: OpenHouseService) {}

  @Post()
  @ApiOperation({ summary: 'Create an open house event' })
  create(@Body() dto: CreateOpenHouseDto) {
    return this.openHouseService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get open house details' })
  findOne(@Param('id') id: string) {
    return this.openHouseService.findOne(id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel an open house event' })
  cancel(@Param('id') id: string) {
    return this.openHouseService.cancel(id);
  }

  @Post(':id/rsvp')
  @ApiOperation({ summary: 'RSVP to an open house' })
  rsvp(@Param('id') id: string, @Body() dto: RsvpOpenHouseDto) {
    return this.openHouseService.rsvp(id, dto);
  }

  // ─── Tour Request Endpoints ──────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('tours')
  @ApiOperation({ summary: 'Request a private property tour' })
  createTourRequest(@CurrentUser() user: any, @Body() dto: CreateTourRequestDto) {
    return this.openHouseService.createTourRequest(user.id, dto);
  }

  @Get('tours/:id')
  @ApiOperation({ summary: 'Get tour request details' })
  getTourRequest(@Param('id') id: string) {
    return this.openHouseService.getTourRequest(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('tours/:id/status')
  @ApiOperation({ summary: 'Update tour request status (confirm/cancel/complete/decline)' })
  updateTourStatus(@Param('id') id: string, @Body() dto: UpdateTourRequestStatusDto) {
    return this.openHouseService.updateTourStatus(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tours/my/list')
  @ApiOperation({ summary: 'List my tour requests' })
  getMyTourRequests(@CurrentUser() user: any) {
    return this.openHouseService.getMyTourRequests(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tours/agent/list')
  @ApiOperation({ summary: 'List tour requests assigned to agent' })
  getAgentTourRequests(@CurrentUser() user: any) {
    return this.openHouseService.getAgentTourRequests(user.id);
  }

  // ─── Agent Availability ──────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('availability')
  @ApiOperation({ summary: 'Set agent availability for tours' })
  setAvailability(@CurrentUser() user: any, @Body() dto: CreateAgentAvailabilityDto) {
    return this.openHouseService.setAgentAvailability(user.id, dto);
  }

  @Get('availability/:agentId')
  @ApiOperation({ summary: 'Get agent availability' })
  getAvailability(@Param('agentId') agentId: string) {
    return this.openHouseService.getAgentAvailability(agentId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('availability/:id')
  @ApiOperation({ summary: 'Remove agent availability slot' })
  removeAvailability(@Param('id') id: string) {
    return this.openHouseService.removeAgentAvailability(id);
  }

  // ─── iCal Export ─────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('tours/calendar/export')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @ApiOperation({ summary: 'Export tours as iCal file' })
  async exportCalendar(@CurrentUser() user: any, @Res() res: Response) {
    const ical = await this.openHouseService.exportTourICal(user.id);
    res.setHeader('Content-Disposition', 'attachment; filename="tours.ics"');
    res.send(ical);
  }
}
