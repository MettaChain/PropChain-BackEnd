import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommissionSplitService } from './commission-split.service';
import { CreateCommissionSplitDto, UpdateCommissionSplitDto } from './dto/commission-split.dto';

@ApiTags('commission-split')
@Controller('commission-splits')
export class CommissionSplitController {
  constructor(private readonly commissionSplitService: CommissionSplitService) {}

  @Post()
  @ApiOperation({ summary: 'Create a commission split' })
  create(@Body() dto: CreateCommissionSplitDto) {
    return this.commissionSplitService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List commission splits' })
  findAll(@Query('transactionId') transactionId?: string) {
    return this.commissionSplitService.findAll(transactionId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a commission split' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.commissionSplitService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update commission split status or adjustment' })
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateCommissionSplitDto) {
    return this.commissionSplitService.update(id, dto);
  }

  @Post(':id/participants/:userId/payout')
  @ApiOperation({ summary: 'Mark a participant payout as paid' })
  markParticipantPaid(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.commissionSplitService.markParticipantPaid(id, userId);
  }
}
