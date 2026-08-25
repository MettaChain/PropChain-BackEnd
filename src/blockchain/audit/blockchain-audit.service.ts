import { Injectable } from '@nestjs/common';
import { BlockchainAuditValidator } from '../service/blockchain-audit.validator';
import { BlockchainAuditRecordDto } from './dto/blockchain-audit-record.dto';

@Injectable()
export class BlockchainAuditService {
  constructor(private readonly validator: BlockchainAuditValidator) {}

  async create(payload: unknown): Promise<BlockchainAuditRecordDto> {
    return this.validator.validateRecord(payload);
  }
}
