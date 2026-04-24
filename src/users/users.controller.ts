import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { UserRole } from '../types/prisma.types';
import { UsersService } from './users.service';
import { CreateUserDto, SearchUsersDto, UpdatePreferencesDto, UpdateUserDto } from './dto/user.dto';
import { DeactivateAccountDto, ReactivateAccountDto } from './dto/deactivation.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('search')
  search(@Query() query: SearchUsersDto) {
    return this.usersService.search(query);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/statistics')
  getStatistics(@CurrentUser() user: AuthUserPayload) {
    return this.usersService.getUserStatistics(user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Put(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/block')
  block(@Param('id') id: string) {
    return this.usersService.block(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/unblock')
  unblock(@Param('id') id: string) {
    return this.usersService.unblock(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/export')
  async exportData(@Param('id') id: string, @CurrentUser() user: AuthUserPayload) {
    if (user.sub !== id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("You are not authorized to export this user's data");
    }

    try {
      const exportData = await this.usersService.exportPersonalData(id);
      const exportsDir = path.join(process.cwd(), 'exports');
      fs.mkdirSync(exportsDir, { recursive: true });

      const filename = `export-${id}-${crypto.randomUUID()}.json`;
      const filepath = path.join(exportsDir, filename);

      fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2));

      return {
        message: 'Export generated successfully',
        downloadLink: `/users/export/download/${filename}`,
        expiresIn: '24 hours',
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'User not found') {
        throw new NotFoundException(error.message);
      }

      throw new InternalServerErrorException('Failed to generate export');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('export/download/:filename')
  async downloadExport(
    @Param('filename') filename: string,
    @Res() res: Response,
    @CurrentUser() user: AuthUserPayload,
  ) {
    const filepath = path.join(process.cwd(), 'exports', filename);

    if (!fs.existsSync(filepath)) {
      throw new NotFoundException('Export file not found');
    }

    const ownerId = this.extractExportOwnerId(filename);

    if (user.sub !== ownerId && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You are not authorized to download this export');
    }

    res.download(filepath, (err) => {
      if (err && !res.headersSent) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
          message: 'Error downloading file',
          error: err.message,
        });
      }
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/deactivate')
  deactivateAccount(
    @CurrentUser() user: AuthUserPayload,
    @Body() deactivateDto: DeactivateAccountDto,
  ) {
    return this.usersService.deactivate(user.sub, deactivateDto);
  }

  @Post('me/reactivate')
  reactivateAccount(
    @Body() data: { email: string; token?: string },
    @Body() reactivateDto: ReactivateAccountDto,
  ) {
    return this.usersService.findByEmail(data.email).then((foundUser) => {
      if (!foundUser) {
        throw new Error('User not found');
      }

      return this.usersService.reactivate(foundUser.id, reactivateDto);
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/verify')
  verifyUser(@Param('id') id: string) {
    return this.usersService.verify(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/unverify')
  unverifyUser(@Param('id') id: string) {
    return this.usersService.unverify(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/deactivate')
  adminDeactivateAccount(@Param('id') id: string, @Body() deactivateDto: DeactivateAccountDto) {
    return this.usersService.deactivate(id, deactivateDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/reactivate')
  adminReactivateAccount(@Param('id') id: string, @Body() reactivateDto: ReactivateAccountDto) {
    return this.usersService.reactivate(id, reactivateDto);
  }

  @UseGuards(JwtAuthGuard)
  @Put('me/preferences')
  updatePreferences(
    @CurrentUser() user: AuthUserPayload,
    @Body() updatePreferencesDto: UpdatePreferencesDto,
  ) {
    return this.usersService.updatePreferences(user.sub, updatePreferencesDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/referral-stats')
  getReferralStats(@CurrentUser() user: AuthUserPayload) {
    return this.usersService.getReferralStats(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/referrals')
  getMyReferrals(@CurrentUser() user: AuthUserPayload) {
    return this.usersService.getMyReferrals(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/login-history')
  getLoginHistory(@CurrentUser() user: AuthUserPayload) {
    return this.usersService.getLoginHistory(user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('scheduled-deletion')
  getScheduledForDeletion() {
    return this.usersService.findScheduledForDeletion();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('delete-scheduled')
  deleteScheduledUsers() {
    return this.usersService.deleteDeactivatedUsers();
  }

  private extractExportOwnerId(filename: string) {
    const match =
      /^export-(.+)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/i.exec(
        filename,
      );

    if (!match) {
      throw new NotFoundException('Invalid export file');
    }

    return match[1];
  }
}
