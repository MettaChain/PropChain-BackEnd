import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { WsTicketService } from './ws-ticket.service';
import { deviceFingerprint } from './device-fingerprint.util';
import { SessionsService } from '../sessions/sessions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly wsTicketService: WsTicketService,
    private readonly sessionsService: SessionsService,
  ) {}

  /**
   * Exchange the caller's access token for a short-lived, session-bound
   * WebSocket handshake ticket (issue #1294).
   */
  @Post('ws-ticket')
  @ApiOperation({ summary: 'Issue a short-lived WebSocket handshake ticket' })
  @ApiResponse({ status: 200, description: 'Ticket issued successfully' })
  async issueWsTicket(@Req() req: any, @CurrentUser() user: AuthUserPayload) {
    const session = user?.jti
      ? await this.sessionsService.getSessionByAccessTokenJti(user.jti)
      : null;

    if (!session) {
      throw new UnauthorizedException('No active session found for this token');
    }

    const fingerprint = deviceFingerprint(req.headers?.['user-agent']);
    const ticket = this.wsTicketService.issue(user.sub, session.id, fingerprint);

    return { ticket, expiresIn: this.wsTicketService.expiresInSeconds };
  }

  @Get()
  @ApiOperation({ summary: 'List all in-app notifications for the current user' })
  @ApiResponse({ status: 200, description: 'Notifications returned successfully' })
  findAll(@Req() req: any) {
    return this.notificationsService.getUserNotifications(req.user.id);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get the count of unread notifications' })
  @ApiResponse({ status: 200, description: 'Count returned successfully' })
  getUnreadCount(@Req() req: any) {
    return this.notificationsService.getUnreadCount(req.user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a specific notification as read' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  markAsRead(@Req() req: any, @Param('id') id: string) {
    return this.notificationsService.markAsRead(id, req.user.id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  markAllAsRead(@Req() req: any) {
    return this.notificationsService.markAllAsRead(req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification' })
  @ApiResponse({ status: 200, description: 'Notification deleted successfully' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.notificationsService.deleteNotification(id, req.user.id);
  }
}
