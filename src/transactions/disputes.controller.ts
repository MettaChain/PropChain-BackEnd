import { Controller, Post, Patch, Get, Body, Param, UseGuards, Req } from '@nestjs/common';
import { DisputesService } from './disputes.service';
import { CreateDisputeDto, ResolveDisputeDto } from './dto/dispute.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types/prisma.types';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Disputes')
@ApiBearerAuth()
@Controller('disputes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Post()
  @ApiOperation({ summary: 'Initiate a transaction dispute' })
  @ApiResponse({ status: 201, description: 'Dispute initiated successfully' })
  create(@Req() req: any, @Body() dto: CreateDisputeDto) {
    return this.disputesService.create(req.user.id, dto);
  }

  @Post(':id/evidence/:documentId')
  @ApiOperation({ summary: 'Attach evidence to a dispute' })
  @ApiResponse({ status: 200, description: 'Evidence attached successfully' })
  addEvidence(@Req() req: any, @Param('id') id: string, @Param('documentId') documentId: string) {
    return this.disputesService.addEvidence(id, req.user.id, documentId);
  }

  @Patch(':id/resolve')
  @Roles('ADMIN' as any)
  @ApiOperation({ summary: 'Resolve a dispute (Admin only)' })
  @ApiResponse({ status: 200, description: 'Dispute resolved successfully' })
  resolve(@Req() req: any, @Param('id') id: string, @Body() dto: ResolveDisputeDto) {
    return this.disputesService.resolve(id, req.user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get dispute details' })
  @ApiResponse({ status: 200, description: 'Dispute details returned successfully' })
  findOne(@Param('id') id: string) {
    return this.disputesService.findOne(id);
  }

  @Get('transaction/:transactionId')
  @ApiOperation({ summary: 'Get disputes for a transaction' })
  @ApiResponse({ status: 200, description: 'Disputes returned successfully' })
  findByTransaction(@Param('transactionId') transactionId: string) {
    return this.disputesService.findByTransaction(transactionId);
  }
}
