import { Controller, Get, Query } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { PaginationDto } from '../common/pagination/pagination.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all transactions with pagination' })
  @ApiResponse({ 
    status: 200, 
    description: 'Returns a paginated list of blockchain and platform transactions.' 
  })
  findAll(@Query() paginationDto: PaginationDto) {
    return this.transactionsService.findAll(paginationDto);
  }
}