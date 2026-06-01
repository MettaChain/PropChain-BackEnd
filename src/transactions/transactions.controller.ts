import {
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Put,
  UseGuards,
  Query,
  HttpStatus,
  HttpCode,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { TransactionsService } from './transactions.service';
import { TransactionNotesService } from './transaction-notes.service';
import { TransactionRemindersService } from './transaction-reminders.service';
import { CreateNoteDto } from './dto/transaction-note.dto';
import { TransactionAuditService } from './transaction-audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { UserRole } from '../types/prisma.types';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
  UpdateEscrowDto,
  RecordTransactionOnChainDto,
  TransactionResponseDto,
  TransactionListQueryDto,
  TransactionAnalyticsDto,
  TransactionAnalyticsGranularity,
  TransactionAnalyticsQueryDto,
} from './dto/transaction.dto';

@ApiTags('Transactions')
@Controller('transactions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TransactionsController {
  constructor(
    private transactionsService: TransactionsService,
    private transactionNotesService: TransactionNotesService,
    private transactionRemindersService: TransactionRemindersService,
    private transactionAuditService: TransactionAuditService,
  ) {}

  @Post()
  @Roles(UserRole.AGENT, UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new transaction',
    description: 'Create a new property transaction record',
  })
  @ApiResponse({
    status: 201,
    description: 'Transaction created successfully',
    type: TransactionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid transaction data' })
  async create(@Body() dto: CreateTransactionDto): Promise<TransactionResponseDto> {
    return this.transactionsService.create(dto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all transactions',
    description: 'Retrieve paginated list of transactions with optional filters',
  })
  @ApiQuery({ name: 'propertyId', required: false, type: 'string' })
  @ApiQuery({ name: 'buyerId', required: false, type: 'string' })
  @ApiQuery({ name: 'sellerId', required: false, type: 'string' })
  @ApiQuery({ name: 'status', required: false, type: 'string' })
  @ApiQuery({ name: 'type', required: false, type: 'string' })
  @ApiQuery({ name: 'page', required: false, type: 'number' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'List of transactions',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
        items: { type: 'array', items: { $ref: '#/components/schemas/TransactionResponseDto' } },
      },
    },
  })
  async findAll(@Query() query: TransactionListQueryDto): Promise<{
    total: number;
    page: number;
    limit: number;
    items: TransactionResponseDto[];
  }> {
    return this.transactionsService.findAll(query);
  }

  @Get('analytics/summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get transaction analytics',
    description:
      'Retrieve transaction volume trends, average price, completion rate, and revenue insights',
  })
  @ApiQuery({ name: 'startDate', required: false, type: 'string' })
  @ApiQuery({ name: 'endDate', required: false, type: 'string' })
  @ApiQuery({
    name: 'granularity',
    required: false,
    enum: TransactionAnalyticsGranularity,
  })
  @ApiQuery({ name: 'type', required: false, type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Transaction analytics summary',
    type: TransactionAnalyticsDto,
  })
  async getAnalytics(
    @Query() query: TransactionAnalyticsQueryDto,
  ): Promise<TransactionAnalyticsDto> {
    return this.transactionsService.getAnalytics(query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get transaction details',
    description: 'Retrieve details of a specific transaction',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'Transaction ID' })
  @ApiResponse({
    status: 200,
    description: 'Transaction details',
    type: TransactionResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async findOne(@Param('id') id: string): Promise<TransactionResponseDto> {
    return this.transactionsService.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.AGENT, UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update transaction',
    description: 'Update transaction status and notes',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'Transaction ID' })
  @ApiResponse({
    status: 200,
    description: 'Transaction updated successfully',
    type: TransactionResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ): Promise<TransactionResponseDto> {
    return this.transactionsService.update(id, dto);
  }

  @Post(':id/record-on-blockchain')
  @Roles(UserRole.AGENT, UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record transaction on blockchain',
    description:
      'Record a transaction on the blockchain with hash generation and smart contract interaction',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'Transaction ID' })
  @ApiResponse({
    status: 200,
    description: 'Transaction recorded on blockchain',
    schema: {
      type: 'object',
      properties: {
        transaction: { $ref: '#/components/schemas/TransactionResponseDto' },
        blockchain: {
          type: 'object',
          properties: {
            transactionHash: { type: 'string' },
            blockchainHash: { type: 'string' },
            contractAddress: { type: 'string' },
            status: { type: 'string' },
            explorerUrl: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiResponse({ status: 400, description: 'Invalid transaction data' })
  async recordOnBlockchain(
    @Param('id') id: string,
    @Body() dto: RecordTransactionOnChainDto,
  ): Promise<any> {
    return this.transactionsService.recordOnBlockchain(id, dto);
  }

  @Get(':id/verify-blockchain')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify transaction on blockchain',
    description: 'Verify that a transaction has been recorded and confirmed on the blockchain',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'Transaction ID' })
  @ApiResponse({
    status: 200,
    description: 'Transaction verification result',
    schema: {
      type: 'object',
      properties: {
        verified: { type: 'boolean' },
        transactionHash: { type: 'string' },
        blockNumber: { type: 'number' },
        status: { type: 'string' },
        confirmations: { type: 'number' },
        timestamp: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiResponse({ status: 400, description: 'Transaction not recorded on blockchain' })
  async verifyOnBlockchain(@Param('id') id: string): Promise<any> {
    return this.transactionsService.verifyOnBlockchain(id);
  }

  @Get('blockchain/stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get blockchain statistics',
    description: 'Retrieve blockchain transaction statistics and metrics',
  })
  @ApiResponse({
    status: 200,
    description: 'Blockchain statistics',
    schema: {
      type: 'object',
      properties: {
        totalTransactions: { type: 'number' },
        confirmedTransactions: { type: 'number' },
        pendingTransactions: { type: 'number' },
        failedTransactions: { type: 'number' },
        totalValue: { type: 'string' },
        lastUpdated: { type: 'string' },
      },
    },
  })
  async getBlockchainStats(): Promise<any> {
    return this.transactionsService.getBlockchainStats();
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add a note to a transaction (#562)' })
  async addNote(
    @Param('id') transactionId: string,
    @Body() dto: CreateNoteDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.transactionNotesService.create(transactionId, user.sub, dto);
  }

  @Get(':id/notes')
  @ApiOperation({ summary: 'Get transaction notes (visibility enforced) (#562)' })
  async getNotes(
    @Param('id') transactionId: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.transactionNotesService.findByTransaction(transactionId, user.sub, user.role);
  }

  @Delete(':transactionId/notes/:noteId')
  @ApiOperation({ summary: 'Delete a transaction note (#562)' })
  async deleteNote(
    @Param('noteId') noteId: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.transactionNotesService.remove(noteId, user.sub, user.role);
  }

  @Post('reminders/send')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Trigger deadline reminder dispatch (Admin only) (#563)' })
  async sendReminders(@Query('daysAhead') daysAhead?: string) {
    return this.transactionRemindersService.sendDeadlineReminders(
      daysAhead ? parseInt(daysAhead, 10) : 3,
    );
  @Patch(':id/escrow')
  @ApiOperation({ summary: 'Update escrow and payment status (#561)' })
  async updateEscrow(
    @Param('id') id: string,
    @Body() dto: UpdateEscrowDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.transactionsService.updateEscrow(id, dto, user.sub);
  }

  @Get(':id/audit')
  @ApiOperation({ summary: 'Get transaction audit log with filtering (#558)' })
  @ApiQuery({ name: 'actorId', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getAuditLog(
    @Param('id') transactionId: string,
    @Query('actorId') actorId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.transactionAuditService.findByTransaction(transactionId, {
      actorId,
      dateFrom,
      dateTo,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
