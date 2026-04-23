import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateUserPreferencesDto, UpdateUserPreferencesDto } from './dto/user-preferences.dto';

@Injectable()
export class UserPreferencesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, data: CreateUserPreferencesDto) {
    // Check if preferences already exist
    const existing = await this.prisma.userPreferences.findUnique({
      where: { userId },
    });

    if (existing) {
      return this.update(userId, data);
    }

    return this.prisma.userPreferences.create({
      data: {
        userId,
        ...data,
      },
    });
  }

  async findByUserId(userId: string) {
    const preferences = await this.prisma.userPreferences.findUnique({
      where: { userId },
    });

    if (!preferences) {
      // Create default preferences if not exist
      return this.create(userId, {});
    }

    return preferences;
  }

  async update(userId: string, data: UpdateUserPreferencesDto) {
    return this.prisma.userPreferences.update({
      where: { userId },
      data,
    });
  }

  async remove(userId: string) {
    return this.prisma.userPreferences.delete({
      where: { userId },
    });
  }
}
