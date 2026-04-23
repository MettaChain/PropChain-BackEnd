import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { UserRole } from '../types/prisma.types';
import {
  AddFraudInvestigationNoteDto,
  AssignFraudAlertDto,
  FraudAlertsQueryDto,
  ManualFraudBlockDto,
  UpdateFraudAlertStatusDto,
} from './dto/fraud.dto';
import { FraudService } from './fraud.service';

@Controller('admin/fraud')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class FraudController {
  constructor(private readonly fraudService: FraudService) {}

  @Get('alerts')
  listAlerts(@Query() query: FraudAlertsQueryDto) {
    return this.fraudService.listAlerts(query);
  }

  @Get('alerts/:id')
  getAlertDetails(@Param('id') id: string) {
    return this.fraudService.getAlertDetails(id);
  }

  @Post('alerts/:id/assign')
  assignAlert(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUserPayload,
    @Body() dto: AssignFraudAlertDto,
  ) {
    return this.fraudService.assignAlert(id, actor, dto);
  }

  @Post('alerts/:id/status')
  updateAlertStatus(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUserPayload,
    @Body() dto: UpdateFraudAlertStatusDto,
  ) {
    return this.fraudService.updateAlertStatus(id, actor, dto);
  }

  @Post('alerts/:id/notes')
  addInvestigationNote(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUserPayload,
    @Body() dto: AddFraudInvestigationNoteDto,
  ) {
    return this.fraudService.addInvestigationNote(id, actor, dto);
  }

  @Post('alerts/:id/block')
  blockUserForAlert(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUserPayload,
    @Body() dto: ManualFraudBlockDto,
  ) {
    return this.fraudService.blockUserForAlert(id, actor, dto);
  }

  @Post('scan/users/:userId')
  scanUser(@Param('userId') userId: string) {
    return this.fraudService.scanUser(userId);
  }

  @Post('scan/properties/:propertyId')
  scanProperty(@Param('propertyId') propertyId: string) {
    return this.fraudService.scanProperty(propertyId);
  }
}
