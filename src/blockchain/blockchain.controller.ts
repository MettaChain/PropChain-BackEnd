// @ts-nocheck

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { BlockchainService } from './blockchain.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import {
  RecordTransactionOnBlockchainDto,
  BlockchainTransactionDto,
  VerifyBlockchainTransactionDto,
  BlockchainVerificationResultDto,
  GetBlockchainStatsDto,
} from './dto/blockchain.dto';

@ApiTags('Blockchain')
@Controller('blockchain')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BlockchainController {
  constructor(private blockchainService: BlockchainService) {}

  @Post('record-transaction')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record transaction on blockchain',
    description:
      'Record a property transaction on the blockchain with hash generation and smart contract interaction',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction successfully recorded',
    type: BlockchainTransactionDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid transaction data' })
  @ApiResponse({ status: 500, description: 'Blockchain recording failed' })
  async recordTransaction(
    @Body() dto: RecordTransactionOnBlockchainDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @CurrentUser() user: AuthUserPayload,
  ): Promise<BlockchainTransactionDto> {
    return this.blockchainService.recordTransactionOnBlockchain(dto);
  }

  @Post('verify-transaction')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify transaction on blockchain',
    description: 'Verify a recorded transaction on the blockchain using its transaction hash',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction verification result',
    type: BlockchainVerificationResultDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid transaction hash' })
  @ApiResponse({ status: 500, description: 'Verification failed' })
  async verifyTransaction(
    @Body() dto: VerifyBlockchainTransactionDto,
  ): Promise<BlockchainVerificationResultDto> {
    return this.blockchainService.verifyBlockchainTransaction(dto);
  }

  @Get('explorer-link/:transactionHash')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get blockchain explorer link',
    description: 'Generate a link to view the transaction on a blockchain explorer',
  })
  @ApiParam({
    name: 'transactionHash',
    description: 'Transaction hash',
    example: '0x...',
  })
  @ApiResponse({
    status: 200,
    description: 'Explorer link generated',
    schema: {
      type: 'object',
      properties: {
        transactionHash: { type: 'string' },
        explorerLink: { type: 'string' },
        network: { type: 'string' },
      },
    },
  })
  getExplorerLink(@Param('transactionHash') transactionHash: string): Record<string, string> {
    const explorerLink = this.blockchainService.generateExplorerLink(transactionHash);
    return {
      transactionHash,
      explorerLink,
      network: this.blockchainService.getCurrentNetwork(),
    };
  }

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get blockchain statistics',
    description: 'Retrieve blockchain transaction statistics and metrics',
  })
  @ApiResponse({
    status: 200,
    description: 'Blockchain statistics',
    type: GetBlockchainStatsDto,
  })
  async getStats(): Promise<GetBlockchainStatsDto> {
    return this.blockchainService.getBlockchainStats();
  }

  @Get('status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get blockchain service status',
    description: 'Check the current status of the blockchain service',
  })
  @ApiResponse({
    status: 200,
    description: 'Service status',
    schema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        network: { type: 'string' },
        contractAddress: { type: 'string' },
        explorerUrl: { type: 'string' },
        cachedTransactions: { type: 'number' },
      },
    },
  })
  getStatus() {
    return this.blockchainService.getStatus();
  }

  // ─── RPC Health Monitoring Endpoints ──────────────────────────────────────

  @Get('rpc/health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get RPC provider health status',
    description: 'Check health of all configured RPC providers with latency and block info',
  })
  async getRpcHealth() {
    return this.blockchainService.getRpcHealthSummary();
  }

  @Post('rpc/health/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger RPC health check',
    description: 'Manually trigger an RPC health check across all providers',
  })
  async triggerRpcHealthCheck() {
    await this.blockchainService.checkRpcHealth();
    return this.blockchainService.getRpcHealthSummary();
  }

  @Get('rpc/gas-price')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get current gas price',
    description: 'Fetch current gas price estimates from the active RPC provider',
  })
  async getGasPrice() {
    return this.blockchainService.getGasPrice();
  }
}
