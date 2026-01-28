import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { PaginationService } from '../common/pagination/pagination.service';
import { PaginationDto } from '../common/pagination/pagination.dto';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {}

  /**
   * Get all users with pagination, sorting, and metadata
   */
  async findAll(paginationDto: PaginationDto) {
    const { page, limit, sort } = paginationDto;
    
    // 1. Calculate offset
    const skip = (page - 1) * limit;

    // 2. Parse sort string (e.g., "email:asc") using the helper service
    const orderBy = this.paginationService.parseSort(sort);

    // 3. Execute data fetch and count in parallel for performance
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        orderBy,
        select: {
          id: true,
          email: true,
          walletAddress: true,
          role: true,
          roleId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.user.count(),
    ]);

    // 4. Return data wrapped in standardized pagination metadata
    return this.paginationService.paginate(users, total, paginationDto);
  }

  async create(createUserDto: CreateUserDto) {
    const { email, walletAddress } = createUserDto;

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email },
          ...(walletAddress ? [{ walletAddress }] : []),
        ],
      },
    });

    if (existingUser) {
      throw new ConflictException('User with this email or wallet address already exists');
    }

    return this.prisma.user.create({
      data: {
        email,
        walletAddress,
        role: 'USER',
      },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { userRole: true },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findByWalletAddress(walletAddress: string) {
    return this.prisma.user.findUnique({
      where: { walletAddress },
    });
  }

  async updateUser(id: string, data: Partial<{ email: string; walletAddress: string }>) {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }
}