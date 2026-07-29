// @ts-nocheck

import { Controller, Delete, Get, Param, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import {
  SessionsListDto,
  RevokeSessionDto,
  RevokeAllSessionsDto,
  UpdateSessionDto,
} from './dto/session.dto';

@ApiTags('Sessions')
@ApiBearerAuth('access-token')
@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  /**
   * Get all sessions for the current user
   */
  @Get()
  async getSessions(@CurrentUser() user: AuthUserPayload): Promise<SessionsListDto> {
    return this.sessionsService.getUserSessions(user.sub);
  }

  /**
   * Get details of a specific session
   */
  @Get(':sessionId')
  async getSession(@Param('sessionId') sessionId: string, @CurrentUser() _user: AuthUserPayload) {
    return this.sessionsService.getSession(sessionId);
  }

  /**
   * Rename a session (update display name)
   */
  @Patch(':sessionId')
  async updateSession(
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateSessionDto,
    @CurrentUser() user: AuthUserPayload,
  ): Promise<import('./dto/session.dto').SessionDto> {
    return this.sessionsService.updateSession(user.sub, sessionId, dto);
  }

  /**
   * Revoke a specific session
   */
  @Delete(':sessionId')
  async revokeSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthUserPayload,
  ): Promise<RevokeSessionDto> {
    return this.sessionsService.revokeSession(user.sub, sessionId);
  }

  /**
   * Revoke all sessions for the current user (optionally except the current one)
   */
  @Delete()
  async revokeAllSessions(@CurrentUser() user: AuthUserPayload): Promise<RevokeAllSessionsDto> {
    return this.sessionsService.revokeAllSessions(user.sub);
  }
}
