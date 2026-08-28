import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class BlockchainRecordingService {
  private readonly logger = new Logger(BlockchainRecordingService.name);

  constructor(@InjectQueue('record-blockchain-transaction') private readonly queue: Queue) {}

  async recordTransaction(transactionId: string) {
    await this.queue.add(
      'record-blockchain-transaction',
      {
        transactionId,
      },
      {
        attempts: 5,

        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    );
  }
}
