import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../database/prisma.service';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { FraudService } from '../fraud/fraud.service';
import { CreatePropertyDto, UpdatePropertyDto } from './dto/property.dto';

interface FindAllParams {
  skip?: number;
  take?: number;
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
}

@Injectable()
export class PropertiesService {
  constructor(
    private prisma: PrismaService,
    private readonly fraudService: FraudService,
  ) {}

  async create(createPropertyDto: CreatePropertyDto, user: AuthUserPayload) {
    const { price, squareFeet, lotSize, ...rest } = createPropertyDto;

    const property = await this.prisma.property.create({
      data: {
        ...rest,
        price: new Decimal(price.toString()),
        squareFeet: squareFeet ? new Decimal(squareFeet.toString()) : null,
        lotSize: lotSize ? new Decimal(lotSize.toString()) : null,
        owner: {
          connect: { id: user.sub },
        },
      },
    });

    await this.fraudService.analyzePropertyListing(property.id, user.role as UserRole);
    return property;
  }

  async findAll(params?: FindAllParams) {
    const { skip, take, where, orderBy } = params || {};
    return this.prisma.property.findMany({
      skip,
      take,
      where,
      orderBy,
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.property.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        documents: true,
      },
    });
  }

  async update(id: string, updatePropertyDto: UpdatePropertyDto, user: AuthUserPayload) {
    const { price, squareFeet, lotSize, ...rest } = updatePropertyDto;

    const property = await this.prisma.property.update({
      where: { id },
      data: {
        ...rest,
        price: price ? new Decimal(price.toString()) : undefined,
        squareFeet: squareFeet ? new Decimal(squareFeet.toString()) : undefined,
        lotSize: lotSize ? new Decimal(lotSize.toString()) : undefined,
      },
    });

    await this.fraudService.analyzePropertyListing(property.id, user.role as UserRole);
    return this.findOne(property.id);
  }

  async remove(id: string) {
    return this.prisma.property.delete({
      where: { id },
    });
  }

  async findByOwnerId(ownerId: string) {
    return this.prisma.property.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
