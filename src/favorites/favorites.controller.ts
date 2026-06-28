import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { ListFavoritesQueryDto } from './dto/favorite.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserPayload } from '../auth/types/auth-user.type';

@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  /**
   * Add a property to the current user's favorites.
   */
  @UseGuards(JwtAuthGuard)
  @Post(':propertyId')
  add(
    @Param('propertyId', new ParseUUIDPipe()) propertyId: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.favoritesService.addFavorite(user.sub, propertyId);
  }

  /**
   * Remove a property from the current user's favorites.
   */
  @UseGuards(JwtAuthGuard)
  @Delete(':propertyId')
  remove(
    @Param('propertyId', new ParseUUIDPipe()) propertyId: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.favoritesService.removeFavorite(user.sub, propertyId);
  }

  /**
   * List the current user's favorites (paginated).
   */
  @UseGuards(JwtAuthGuard)
  @Get()
  list(@CurrentUser() user: AuthUserPayload, @Query() query: ListFavoritesQueryDto) {
    return this.favoritesService.listFavorites(user.sub, {
      skip: query.skip,
      take: query.take,
    });
  }

  /**
   * Total count of favorites for the current user.
   */
  @UseGuards(JwtAuthGuard)
  @Get('count')
  async myCount(@CurrentUser() user: AuthUserPayload) {
    const count = await this.favoritesService.getUserFavoriteCount(user.sub);
    return { count };
  }

  /**
   * Whether a property is currently favorited by the user.
   */
  @UseGuards(JwtAuthGuard)
  @Get(':propertyId/status')
  async status(
    @Param('propertyId', new ParseUUIDPipe()) propertyId: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    const isFavorite = await this.favoritesService.isFavorite(user.sub, propertyId);
    return { isFavorite };
  }

  /**
   * Public — total number of users that have favorited a property.
   */
  @Get('property/:propertyId/count')
  async propertyCount(@Param('propertyId', new ParseUUIDPipe()) propertyId: string) {
    const count = await this.favoritesService.getPropertyFavoriteCount(propertyId);
    return { propertyId, count };
  }
}
