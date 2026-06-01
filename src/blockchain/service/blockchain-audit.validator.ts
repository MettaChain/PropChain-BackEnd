import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { BlockchainAuditRecordDto }
  from './dto/blockchain-audit-record.dto';

@Injectable()
export class BlockchainAuditValidator {
  private readonly logger =
    new Logger(BlockchainAuditValidator.name);

  async validateRecord(
    payload: unknown,
  ): Promise<BlockchainAuditRecordDto> {
    const dto = plainToInstance(
      BlockchainAuditRecordDto,
      payload,
    );

    const errors =
      await validate(dto);

    if (errors.length > 0) {
      this.logger.error(
        'Invalid blockchain audit record',
        {
          payload,
          errors,
        },
      );

      throw new BadRequestException(
        'Invalid blockchain audit record',
      );
    }

    return dto;
  }
}