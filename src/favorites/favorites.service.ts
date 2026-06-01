import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface ListFavoritesParams {
  skip?: number;
  take?: number;
}

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Add a property to a user's favorites. Idempotent — returns the existing
   * favorite when the user has already favorited the property.
   */
  async addFavorite(userId: string, propertyId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });

    if (!property) {
      throw new NotFoundException(`Property ${propertyId} not found`);
    }

    try {
      return await this.prisma.propertyFavorite.create({
        data: { userId, propertyId },
      });
    } catch (err: unknown) {
      // P2002 = unique constraint violation (already favorited)
      if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
        const existing = await this.prisma.propertyFavorite.findUnique({
          where: { userId_propertyId: { userId, propertyId } },
        });
        if (existing) {
          return existing;
        }
        throw new ConflictException('Property already in favorites');
      }
      throw err;
    }
  }

  /**
   * Remove a property from a user's favorites.
   */
  async removeFavorite(userId: string, propertyId: string) {
    const result = await this.prisma.propertyFavorite.deleteMany({
      where: { userId, propertyId },
    });

    if (result.count === 0) {
      throw new NotFoundException('Favorite not found');
    }

    return { success: true };
  }

  /**
   * List favorites for a user with the embedded property details.
   */
  async listFavorites(userId: string, params: ListFavoritesParams = {}) {
    const skip = params.skip ?? 0;
    const take = params.take ?? 20;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.propertyFavorite.findMany({
        where: { userId },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          property: {
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
          },
        },
      }),
      this.prisma.propertyFavorite.count({ where: { userId } }),
    ]);

    return { items, total, skip, take };
  }

  /**
   * Total number of favorites saved by a user.
   */
  async getUserFavoriteCount(userId: string): Promise<number> {
    return this.prisma.propertyFavorite.count({ where: { userId } });
  }

  /**
   * Number of users that have favorited a property (popularity metric).
   */
  async getPropertyFavoriteCount(propertyId: string): Promise<number> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });

    if (!property) {
      throw new NotFoundException(`Property ${propertyId} not found`);
    }

    return this.prisma.propertyFavorite.count({ where: { propertyId } });
  }

  /**
   * Whether a property is currently in a user's favorites.
   */
  async isFavorite(userId: string, propertyId: string): Promise<boolean> {
    const favorite = await this.prisma.propertyFavorite.findUnique({
      where: { userId_propertyId: { userId, propertyId } },
      select: { id: true },
    });
    return favorite !== null;
  }
}
