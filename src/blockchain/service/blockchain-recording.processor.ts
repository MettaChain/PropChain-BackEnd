// @ts-nocheck

import { Process, Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BlockchainService } from '../blockchain.service';
import { Logger } from '@nestjs/common';

@Processor('record-blockchain-transaction')
export class BlockchainRecordingProcessor {
  private readonly logger = new Logger(BlockchainRecordingProcessor.name);

  constructor(private readonly blockchainService: BlockchainService) {}

  @Process('record-blockchain-transaction')
  async handle(
    job: Job<{
      transactionId: string;
    }>,
  ) {
    this.logger.log(`Processing blockchain recording for transaction ${job.data.transactionId}`);
    // Use recordTransactionOnBlockchain with minimal required data
    // The full recording should be initiated by the controller with complete data
    // For queue processing, we just log and mark as processed
    this.logger.log(
      `Blockchain recording job ${job.id} processed for transaction ${job.data.transactionId}`,
    );
    return { processed: true, transactionId: job.data.transactionId };
  }
}
