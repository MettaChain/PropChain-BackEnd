import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CompleteMilestoneDto,
  CreateEscrowDto,
  DisputeEscrowDto,
  EscrowResponseDto,
  HoldFundsDto,
  RefundEscrowDto,
  ReleaseEscrowDto,
  ResolveDisputeDto,
} from './dto/escrow-management.dto';
import { EscrowManagementService } from './escrow-management.service';

@ApiTags('escrow-management')
@Controller('escrow-management')
export class EscrowManagementController {
  constructor(private readonly escrowService: EscrowManagementService) {}

  @Post()
  @ApiOperation({ summary: 'Create a pending escrow for a transaction' })
  create(@Body() dto: CreateEscrowDto): Promise<EscrowResponseDto> {
    return this.escrowService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List escrows, optionally filtered by transaction' })
  findAll(@Query('transactionId') transactionId?: string): EscrowResponseDto[] {
    return this.escrowService.findAll(transactionId);
  }

  @Get(':transactionId')
  @ApiOperation({ summary: 'Get an escrow by transaction id' })
  findOne(@Param('transactionId') transactionId: string): Promise<EscrowResponseDto> {
    return this.escrowService.findOne(transactionId);
  }

  @Get(':transactionId/balance')
  @ApiOperation({ summary: 'Get the currently held escrow balance' })
  getBalance(@Param('transactionId') transactionId: string): Promise<number> {
    return this.escrowService.getBalance(transactionId);
  }

  @Get(':transactionId/audit')
  @ApiOperation({ summary: 'Get the full escrow audit trail' })
  getAuditTrail(@Param('transactionId') transactionId: string) {
    return this.escrowService.getAuditTrail(transactionId);
  }

  @Get(':transactionId/fees')
  @ApiOperation({ summary: 'Get the fee breakdown used to fund the escrow' })
  getFeeBreakdown(@Param('transactionId') transactionId: string) {
    return this.escrowService.getFeeBreakdown(transactionId);
  }

  @Post(':transactionId/hold')
  @ApiOperation({ summary: 'Hold funds for a pending escrow' })
  holdFunds(
    @Param('transactionId') transactionId: string,
    @Body() dto: HoldFundsDto,
  ): Promise<EscrowResponseDto> {
    return this.escrowService.holdFunds(transactionId, dto);
  }

  @Post(':transactionId/milestones/complete')
  @ApiOperation({ summary: 'Complete a transaction milestone' })
  completeMilestone(
    @Param('transactionId') transactionId: string,
    @Body() dto: CompleteMilestoneDto,
  ): Promise<EscrowResponseDto> {
    return this.escrowService.markMilestoneComplete(transactionId, dto.milestoneId, dto.actorId);
  }

  @Post(':transactionId/release')
  @ApiOperation({ summary: 'Release funds once all milestones are complete' })
  release(
    @Param('transactionId') transactionId: string,
    @Body() dto: ReleaseEscrowDto,
  ): Promise<EscrowResponseDto> {
    return this.escrowService.release(transactionId, dto.actorId);
  }

  @Post(':transactionId/refund')
  @ApiOperation({ summary: 'Refund the escrow to the buyer' })
  refund(
    @Param('transactionId') transactionId: string,
    @Body() dto: RefundEscrowDto,
  ): Promise<EscrowResponseDto> {
    return this.escrowService.refund(transactionId, dto.reason, dto.actorId);
  }

  @Post(':transactionId/dispute')
  @ApiOperation({ summary: 'Place a dispute hold on the escrow' })
  placeDisputeHold(
    @Param('transactionId') transactionId: string,
    @Body() dto: DisputeEscrowDto,
  ): Promise<EscrowResponseDto> {
    return this.escrowService.placeDisputeHold(transactionId, dto.reason, dto.actorId);
  }

  @Post(':transactionId/dispute/resolve')
  @ApiOperation({ summary: 'Resolve a dispute by releasing or refunding' })
  resolveDispute(
    @Param('transactionId') transactionId: string,
    @Body() dto: ResolveDisputeDto,
  ): Promise<EscrowResponseDto> {
    return this.escrowService.resolveDispute(transactionId, dto.resolution, dto.actorId);
  }
}
