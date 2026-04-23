import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateUserDto, UpdateUserDto, UpdatePreferencesDto, SearchUsersDto } from './dto/user.dto';
import { DeactivateAccountDto, ReactivateAccountDto } from './dto/deactivation.dto';
import { hashPassword, sanitizeUser } from '../auth/security.utils';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}

  async create(data: CreateUserDto) {
    const passwordHash = await hashPassword(data.password);

    // Generate unique referral code
    let referralCode: string;
    do {
      referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    } while (await this.prisma.user.findUnique({ where: { referralCode } }));

    // Handle referral
    let referredById: string | null = null;
    if (data.referralCode) {
      const referrer = await this.prisma.user.findUnique({
        where: { referralCode: data.referralCode },
      });
      if (referrer) {
        referredById = referrer.id;
      }
    }

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        password: passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        preferredChannel: data.preferredChannel,
        languagePreference: data.languagePreference,
        timezone: data.timezone,
        contactHours: data.contactHours,
        referralCode,
        referredById,
        passwordHistory: {
          create: {
            passwordHash,
          },
        },
      },
    });

    return sanitizeUser(user);
  }

  async findAll() {
    return this.prisma.user.findMany({
      where: {
        isDeactivated: false, // Hide deactivated users
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isVerified: true,
        createdAt: true,
      },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id,
        isDeactivated: false, // Don't show deactivated users
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isVerified: true,
        avatar: true,
        preferredChannel: true,
        languagePreference: true,
        timezone: true,
        contactHours: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async update(id: string, data: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isVerified: true,
        avatar: true,
        preferredChannel: true,
        languagePreference: true,
        timezone: true,
        contactHours: true,
        updatedAt: true,
      },
    });
  }

  async updatePreferences(id: string, data: UpdatePreferencesDto) {
    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        preferredChannel: true,
        languagePreference: true,
        timezone: true,
        contactHours: true,
        updatedAt: true,
      },
    });
  }

  async updateAvatar(id: string, avatarUrl: string | null) {
    return this.prisma.user.update({
      where: { id },
      data: { avatar: avatarUrl },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isVerified: true,
        avatar: true,
        updatedAt: true,
      },
    });
  }

  async block(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { isBlocked: true },
      select: {
        id: true,
        email: true,
        isBlocked: true,
      },
    });
  }

  async unblock(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { isBlocked: false },
      select: {
        id: true,
        email: true,
        isBlocked: true,
      },
    });
  }

  async remove(id: string) {
    return this.prisma.user.delete({
      where: { id },
    });
  }

  async deactivate(userId: string, data: DeactivateAccountDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.isDeactivated) {
      throw new Error('Account is already deactivated');
    }

    // Calculate scheduled deletion date (30 days from now if scheduled)
    const scheduledDeletionAt = data.scheduleDeletion
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      : null;

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isDeactivated: true,
        deactivatedAt: new Date(),
        scheduledDeletionAt,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isDeactivated: true,
        deactivatedAt: true,
        scheduledDeletionAt: true,
      },
    });

    this.logger.log(
      `User ${userId} (${user.email}) deactivated. Scheduled deletion: ${scheduledDeletionAt ? scheduledDeletionAt.toISOString() : 'None'}`,
    );

    return updatedUser;
  }

  async reactivate(userId: string, data: ReactivateAccountDto = {}) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.isDeactivated) {
      throw new Error('Account is not deactivated');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isDeactivated: false,
        deactivatedAt: null,
        scheduledDeletionAt: null,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isDeactivated: true,
        deactivatedAt: true,
        scheduledDeletionAt: true,
      },
    });

    this.logger.log(`User ${userId} (${user.email}) reactivated`);

    return updatedUser;
  }

  async findActiveUsers() {
    return this.prisma.user.findMany({
      where: {
        isDeactivated: false,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isVerified: true,
        avatar: true,
        createdAt: true,
      },
    });
  }

  async search(filters: SearchUsersDto) {
    const { q, email, name, page = 1, limit = 10 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {
      isDeactivated: false,
    };

    if (q) {
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (email) {
      where.email = { contains: email, mode: 'insensitive' };
    }

    if (name) {
      const nameParts = name.split(' ');
      if (nameParts.length > 1) {
        where.AND = [
          { firstName: { contains: nameParts[0], mode: 'insensitive' } },
          { lastName: { contains: nameParts[nameParts.length - 1], mode: 'insensitive' } },
        ];
      } else {
        where.OR = [
          { firstName: { contains: name, mode: 'insensitive' } },
          { lastName: { contains: name, mode: 'insensitive' } },
        ];
      }
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isVerified: true,
          avatar: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findScheduledForDeletion() {
    return this.prisma.user.findMany({
      where: {
        isDeactivated: true,
        scheduledDeletionAt: {
          not: null,
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        deactivatedAt: true,
        scheduledDeletionAt: true,
      },
    });
  }

  async deleteDeactivatedUsers() {
    const now = new Date();

    // Find users ready for deletion
    const usersToDelete = await this.prisma.user.findMany({
      where: {
        isDeactivated: true,
        scheduledDeletionAt: {
          lte: now,
        },
      },
      select: {
        id: true,
        email: true,
      },
    });

    if (usersToDelete.length === 0) {
      return { deletedCount: 0 };
    }

    const userIds = usersToDelete.map((u: { id: string; email: string }) => u.id);

    // Delete in transaction to ensure atomicity
    const result = await this.prisma.$transaction(async (tx: any) => {
      // Delete related records first (if not using cascade)
      await tx.loginAttempt.deleteMany({
        where: {
          email: {
            in: usersToDelete.map((u: { id: string; email: string }) => u.email),
          },
        },
      });

      // Delete users
      const deleteResult = await tx.user.deleteMany({
        where: {
          id: {
            in: userIds,
          },
        },
      });

      return deleteResult;
    });

    this.logger.log(`Deleted ${result.count} deactivated users`);

    return { deletedCount: result.count };
  }

  async getReferralStats(userId: string) {
    const referralCount = await this.prisma.user.count({
      where: { referredById: userId },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });

    return {
      referralCode: user?.referralCode,
      referralCount,
    };
  }

  async getMyReferrals(userId: string) {
    return this.prisma.user.findMany({
      where: { referredById: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        createdAt: true,
      },
    });
  }

  async getLoginHistory(userId: string) {
    return this.prisma.loginHistory.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      select: {
        timestamp: true,
        ipAddress: true,
        userAgent: true,
      },
    });
  }

  async verify(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { isVerified: true },
      select: {
        id: true,
        isVerified: true,
      },
    });
  }

  async unverify(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { isVerified: false },
      select: {
        id: true,
        isVerified: true,
      },
    });
  }
}
