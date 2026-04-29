import { Controller, Get, Post, Body, Put, Delete, Patch, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UserPreferencesService } from './user-preferences.service';
import {
  CreateUserPreferencesDto,
  UpdateUserPreferencesDto,
  UpdateNotificationPreferencesDto,
} from './dto/user-preferences.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('User Preferences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/preferences')
export class UserPreferencesController {
  constructor(private readonly preferencesService: UserPreferencesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all preferences for the current user' })
  @ApiResponse({ status: 200, description: 'Preferences returned successfully' })
  getPreferences(@CurrentUser() user: any) {
    return this.preferencesService.findByUserId(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create preferences for the current user' })
  @ApiResponse({ status: 201, description: 'Preferences created successfully' })
  createPreferences(@CurrentUser() user: any, @Body() createDto: CreateUserPreferencesDto) {
    return this.preferencesService.create(user.id, createDto);
  }

  @Put()
  @ApiOperation({ summary: 'Update all preferences for the current user' })
  @ApiResponse({ status: 200, description: 'Preferences updated successfully' })
  updatePreferences(@CurrentUser() user: any, @Body() updateDto: UpdateUserPreferencesDto) {
    return this.preferencesService.update(user.id, updateDto);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete preferences for the current user' })
  @ApiResponse({ status: 200, description: 'Preferences deleted successfully' })
  removePreferences(@CurrentUser() user: any) {
    return this.preferencesService.remove(user.id);
  }

  // ─── Notification Preferences (#370) ──────────────────────────────────────

  @Get('notifications')
  @ApiOperation({
    summary: 'Get notification preferences',
    description:
      'Returns channel selection, delivery frequency, subscribed event types, and quiet hours settings.',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification preferences returned successfully',
    schema: {
      example: {
        channels: { email: true, sms: false, push: false, inApp: true },
        frequency: 'INSTANT',
        eventTypes: ['TRANSACTION_UPDATE', 'PROPERTY_ALERT'],
        quietHours: { enabled: true, start: '22:00', end: '08:00' },
        perEventSettings: {
          MARKET_UPDATE: { email: false, sms: false, push: false, inApp: true },
        },
      },
    },
  })
  getNotificationPreferences(@CurrentUser() user: any) {
    return this.preferencesService.getNotificationPreferences(user.id);
  }

  @Patch('notifications')
  @ApiOperation({
    summary: 'Update notification preferences',
    description:
      'Update any combination of: channel selection (email/sms/push/inApp), delivery frequency (INSTANT/HOURLY/DAILY/WEEKLY), subscribed event types, quiet hours window, and per-event channel overrides.',
  })
  @ApiResponse({ status: 200, description: 'Notification preferences updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  updateNotificationPreferences(
    @CurrentUser() user: any,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.preferencesService.updateNotificationPreferences(user.id, dto);
  }
}
