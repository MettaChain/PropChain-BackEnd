// @ts-nocheck

import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SupportTicketsService } from './support-tickets.service';
import {
  CreateSupportTicketDto,
  UpdateTicketStatusDto,
  AssignTicketDto,
  AddTicketNoteDto,
} from './dto/support-ticket.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('support-tickets')
export class SupportTicketsController {
  constructor(private readonly supportTicketsService: SupportTicketsService) {}

  @Post()
  createTicket(@CurrentUser() user: any, @Body() dto: CreateSupportTicketDto) {
    return this.supportTicketsService.createTicket(user.id, dto);
  }

  @Get()
  listTickets(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.supportTicketsService.listTickets({
      status,
      priority,
      category,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('my')
  getMyTickets(@CurrentUser() user: any) {
    return this.supportTicketsService.listTickets({ userId: user.id });
  }

  @Get('assigned')
  getAssignedTickets(@CurrentUser() user: any) {
    return this.supportTicketsService.listTickets({ assignedToId: user.id });
  }

  @Get('unassigned')
  getUnassignedTickets() {
    return this.supportTicketsService.getUnassignedTickets();
  }

  @Get('metrics')
  getMetrics(@CurrentUser() user: any) {
    return this.supportTicketsService.getTicketMetrics(user.id);
  }

  @Get(':id')
  getTicket(@Param('id') id: string) {
    return this.supportTicketsService.getTicket(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.supportTicketsService.updateStatus(id, dto, user.id);
  }

  @Patch(':id/assign')
  assignTicket(@Param('id') id: string, @Body() dto: AssignTicketDto) {
    return this.supportTicketsService.assignTicket(id, dto);
  }

  @Post(':id/notes')
  addNote(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: AddTicketNoteDto) {
    return this.supportTicketsService.addNote(id, dto, user.id);
  }

  @Get(':id/sla')
  getSlaInfo(@Param('id') id: string) {
    return this.supportTicketsService.getSlaInfo(id);
  }
}
