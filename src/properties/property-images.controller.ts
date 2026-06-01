import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { PropertyImagesService, UploadedImageFile } from './property-images.service';
import { ReorderImagesDto } from './dto/property-image.dto';

const MAX_FILES_PER_REQUEST = 20;

@Controller('properties/:propertyId/images')
export class PropertyImagesController {
  constructor(private readonly propertyImagesService: PropertyImagesService) {}

  /**
   * Upload one or more images for a property.
   * Form-data field name: `images` (repeatable). Up to 20 files per request.
   */
  @UseGuards(JwtAuthGuard)
  @Post()
  @UseInterceptors(FilesInterceptor('images', MAX_FILES_PER_REQUEST))
  async uploadImages(
    @Param('propertyId', new ParseUUIDPipe()) propertyId: string,
    @CurrentUser() user: AuthUserPayload,
    @UploadedFiles() files: UploadedImageFile[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException(
        `Provide one or more files in the 'images' field (max ${MAX_FILES_PER_REQUEST} per request)`,
      );
    }
    const created = await this.propertyImagesService.uploadImages(
      propertyId,
      user.sub,
      user.role,
      files,
    );
    return { items: created, uploaded: created.length };
  }

  /**
   * List all images of a property in their stored order. Public.
   */
  @Get()
  list(@Param('propertyId', new ParseUUIDPipe()) propertyId: string) {
    return this.propertyImagesService.listImages(propertyId);
  }

  /**
   * Reorder all images of a property.
   * Body: { imageIds: string[] } — full sequence of image UUIDs in desired order.
   */
  @UseGuards(JwtAuthGuard)
  @Patch('reorder')
  reorder(
    @Param('propertyId', new ParseUUIDPipe()) propertyId: string,
    @CurrentUser() user: AuthUserPayload,
    @Body() body: ReorderImagesDto,
  ) {
    return this.propertyImagesService.reorderImages(propertyId, body.imageIds, user.sub, user.role);
  }

  /**
   * Mark a specific image as the primary (cover) image of the property.
   */
  @UseGuards(JwtAuthGuard)
  @Patch(':imageId/primary')
  setPrimary(
    @Param('propertyId', new ParseUUIDPipe()) propertyId: string,
    @Param('imageId', new ParseUUIDPipe()) imageId: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.propertyImagesService.setPrimaryImage(propertyId, imageId, user.sub, user.role);
  }

  /**
   * Delete a single image. If the deleted image was primary, the next image
   * by order is auto-promoted (handled in the service).
   */
  @UseGuards(JwtAuthGuard)
  @Delete(':imageId')
  delete(
    @Param('propertyId', new ParseUUIDPipe()) propertyId: string,
    @Param('imageId', new ParseUUIDPipe()) imageId: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.propertyImagesService.deleteImage(propertyId, imageId, user.sub, user.role);
  }
}
