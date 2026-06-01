@Processor(
  'blockchain-recording',
)
export class BlockchainRecordingProcessor {
  constructor(
    private readonly blockchainService:
      BlockchainService,
  ) {}

  @Process(
    'record-blockchain-transaction',
  )
  async handle(
    job: Job<{
      transactionId: string;
    }>,
  ) {
    return this.blockchainService
      .submitTransaction(
        job.data.transactionId,
      );
  }
}