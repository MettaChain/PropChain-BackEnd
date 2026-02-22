import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { PropertySearchDto } from '../dto/property-search.dto';

@Injectable()
export class SearchAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

//   async logSearch(userId: string | undefined, dto: PropertySearchDto, resultCount: number) {
//     await this.prisma.searchLog.create({
//       data: {
//         userId: userId ?? null,
//         filters: dto,
//         resultCount,
//       },
//     });
//   }
}