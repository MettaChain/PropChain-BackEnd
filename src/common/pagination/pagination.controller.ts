import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PaginationDto, PaginatedResponse } from './pagination.dto';
import { PaginationService } from './pagination.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

// Example Entity
class User {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
}

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly paginationService: PaginationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all users with pagination' })
  async findAll(@Query() paginationDto: PaginationDto): Promise<PaginatedResponse<User>> {
    const { page = 1, limit = 10, sortBy, sortOrder } = paginationDto;

    // Calculate skip
    const skip = this.paginationService.getSkip(page, limit);

    // Build query
    const queryBuilder = this.userRepository.createQueryBuilder('user');

    // Apply sorting if provided
    if (sortBy) {
      const sanitizedField = this.paginationService.sanitizeSortField(sortBy);
      if (sanitizedField) {
        queryBuilder.orderBy(`user.${sanitizedField}`, sortOrder);
      }
    } else {
      // Default sorting
      queryBuilder.orderBy('user.createdAt', 'DESC');
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    const data = await queryBuilder.skip(skip).take(limit).getMany();

    // Return paginated response
    return this.paginationService.createResponse(data, total, paginationDto);
  }
}

// Example for different ORMs or services:

// Using TypeORM's findAndCount
export class AlternativeController {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly paginationService: PaginationService,
  ) {}

  @Get()
  async findAllAlternative(@Query() paginationDto: PaginationDto): Promise<PaginatedResponse<User>> {
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder } = paginationDto;

    const skip = this.paginationService.getSkip(page, limit);
    const sanitizedSortBy = this.paginationService.sanitizeSortField(sortBy);

    const [data, total] = await this.userRepository.findAndCount({
      skip,
      take: limit,
      order: {
        [sanitizedSortBy]: sortOrder,
      },
    });

    return this.paginationService.createResponse(data, total, paginationDto);
  }
}
