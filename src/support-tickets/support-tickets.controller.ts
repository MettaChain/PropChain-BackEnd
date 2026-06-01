import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { SupportTicketsService } from './support-tickets.service';

@Controller('support-tickets')
export class SupportTicketsController {
  constructor(private readonly supportTicketsService: SupportTicketsService) {}

  @Post(':id/internal-notes')
  addInternalNote(@Param('id') id: string, @Req() req: any, @Body('content') content: string) {
    return this.supportTicketsService.addInternalNote(id, req.user?.id ?? 'system', content);
  }

  @Post(':id/public-replies')
  addPublicReply(@Param('id') id: string, @Req() req: any, @Body('content') content: string) {
    return this.supportTicketsService.addPublicReply(id, req.user?.id ?? 'system', content);
  }

  @Get(':id/agent-view')
  listForAgent(@Param('id') id: string) {
    return this.supportTicketsService.listForAgent(id);
  }

  @Get(':id/user-view')
  listPublicForUser(@Param('id') id: string) {
    return this.supportTicketsService.listPublicForUser(id);
  }
}
