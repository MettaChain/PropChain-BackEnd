import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CacheService } from '../cache/cache.service';
import { CreateInvestmentDto, InvestmentResponseDto } from './dto/create-investment.dto';

const CACHE_TAG = 'investments';

@Injectable()
export class InvestmentsService {
  private readonly investments = new Map<string, InvestmentResponseDto>();

  constructor(private readonly cacheService: CacheService) {}

  async create(dto: CreateInvestmentDto): Promise<InvestmentResponseDto> {
    const investment: InvestmentResponseDto = {
      id: randomUUID(),
      propertyId: dto.propertyId,
      amount: dto.amount,
      createdAt: new Date().toISOString(),
    };
    this.investments.set(investment.id, investment);
    await this.cacheService.invalidateByTag(CACHE_TAG);
    return investment;
  }

  findAll(): Promise<InvestmentResponseDto[]> {
    return this.cacheService.getOrSetLegacy(
      'investments:all',
      async () => Array.from(this.investments.values()),
      undefined,
      CACHE_TAG,
    );
  }

  async findOne(id: string): Promise<InvestmentResponseDto> {
    const investment = await this.cacheService.getOrSetLegacy(
      `investments:${id}`,
      async () => this.investments.get(id) ?? null,
      undefined,
      CACHE_TAG,
    );
    if (!investment) {
      throw new NotFoundException(`Investment ${id} not found`);
    }
    return investment;
  }
}
