import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import {
  CreateTransactionDto,
  CreateTransactionTaxStrategyDto,
  UpdateTransactionTaxStrategyDto,
} from './dto/transaction.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createTransactionDto: CreateTransactionDto, @CurrentUser() user: AuthUserPayload) {
    return this.transactionsService.createTransaction(createTransactionDto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/tax-strategies')
  listTaxStrategies(@Param('id') transactionId: string, @CurrentUser() user: AuthUserPayload) {
    return this.transactionsService.listTaxStrategies(transactionId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/tax-strategies')
  createTaxStrategySuggestion(
    @Param('id') transactionId: string,
    @Body() createTaxStrategyDto: CreateTransactionTaxStrategyDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.transactionsService.createTaxStrategySuggestion(
      transactionId,
      createTaxStrategyDto,
      user,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/tax-strategies/:strategyId')
  updateTaxStrategySuggestion(
    @Param('id') transactionId: string,
    @Param('strategyId') strategyId: string,
    @Body() updateTaxStrategyDto: UpdateTransactionTaxStrategyDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.transactionsService.updateTaxStrategySuggestion(
      transactionId,
      strategyId,
      updateTaxStrategyDto,
      user,
    );
  }
}
