import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, UpdatePreferencesDto, SearchUsersDto } from './dto/user.dto';
import { DeactivateAccountDto, ReactivateAccountDto } from './dto/deactivation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { UserRole } from '../types/prisma.types';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
  // Public endpoint for user registration
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

  // User self-service deactivation
  @UseGuards(JwtAuthGuard)
  @Post('me/deactivate')
  deactivateAccount(
    @CurrentUser() user: AuthUserPayload,
    @Body() deactivateDto: DeactivateAccountDto,
  ) {
    return this.usersService.deactivate(user.sub, deactivateDto);
  }

  // User self-service reactivation
  @Post('me/reactivate')
  reactivateAccount(
    @Body() data: { email: string; token?: string },
    @Body() reactivateDto: ReactivateAccountDto,
  ) {
    // Find user by email first
    return this.usersService.findByEmail(data.email).then((foundUser) => {
      if (!foundUser) {
        throw new Error('User not found');
      }
      return this.usersService.reactivate(foundUser.id, reactivateDto);
    });
  }

  // Admin endpoints for deactivation management
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

  // User self-service preferences update
  @UseGuards(JwtAuthGuard)
  @Put('me/preferences')
  updatePreferences(
    @CurrentUser() user: AuthUserPayload,
    @Body() updatePreferencesDto: UpdatePreferencesDto,
  ) {
    return this.usersService.updatePreferences(user.sub, updatePreferencesDto);
  }

  // Referral system
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
}
