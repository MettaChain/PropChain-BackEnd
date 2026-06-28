// @ts-nocheck

import {
  Controller,
  Post,
  Delete,
  Get,
  UseInterceptors,
  UploadedFile,
  Body,
  Param,
  Request,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AvatarUploadService } from './avatar-upload.service';
import { UsersService } from './users.service';
import { AvatarUploadResponseDto } from './dto/avatar-upload.dto';
import { FilenameValidationPipe } from './pipes/filename-validation.pipe';

// Multer type definition
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}

@Controller('users/avatar')
export class AvatarUploadController {
  constructor(
    private readonly avatarUploadService: AvatarUploadService,
    private readonly usersService: UsersService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('avatar'))
  async uploadAvatar(
    @UploadedFile() file: MulterFile,
    @Request() req: { user: { id: string } },
  ): Promise<AvatarUploadResponseDto> {
    if (!req.user || !req.user.id) {
      throw new BadRequestException('User not authenticated');
    }

    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    try {
      // Upload avatar file
      const uploadResult = await this.avatarUploadService.uploadAvatar(req.user.id, file);

      // Update user's avatar URL in database
      await this.usersService.updateAvatar(req.user.id, uploadResult.avatarUrl);

      return uploadResult;
    } catch (error) {
      throw new BadRequestException(`Failed to upload avatar: ${error.message}`);
    }
  }

  @Delete('delete')
  async deleteAvatar(
    @Body('filename', FilenameValidationPipe) filename: string,
    @Request() req: { user: { id: string } },
  ): Promise<{ message: string }> {
    if (!req.user || !req.user.id) {
      throw new BadRequestException('User not authenticated');
    }

    try {
      // Delete avatar file
      await this.avatarUploadService.deleteAvatar(req.user.id, filename);

      // Remove avatar URL from user's record
      await this.usersService.updateAvatar(req.user.id, null);

      return { message: 'Avatar deleted successfully' };
    } catch (error) {
      throw new BadRequestException(`Failed to delete avatar: ${error.message}`);
    }
  }

  @Get(':filename')
  async getAvatar(
    @Param('filename', FilenameValidationPipe) filename: string,
    @Request() req: { user: { id: string } },
  ): Promise<{ avatarUrl: string }> {
    if (!req.user || !req.user.id) {
      throw new BadRequestException('User not authenticated');
    }

    try {
      const avatarUrl = await this.avatarUploadService.getAvatarUrl(req.user.id, filename);
      return { avatarUrl };
    } catch (error) {
      throw new NotFoundException('Avatar not found');
    }
  }

  @Get('current')
  async getCurrentAvatar(
    @Request() req: { user: { id: string } },
  ): Promise<{ avatarUrl?: string }> {
    if (!req.user || !req.user.id) {
      throw new BadRequestException('User not authenticated');
    }

    try {
      const user = await this.usersService.findOne(req.user.id);
      if (!user) {
        throw new NotFoundException('User not found');
      }
      return { avatarUrl: user.avatar || undefined };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new NotFoundException('User not found');
    }
  }
}
