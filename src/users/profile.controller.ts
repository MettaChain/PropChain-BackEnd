import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { UpdateUserDto } from './dto/user.dto';

@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async getProfile(@CurrentUser() user: AuthUserPayload) {
    return this.usersService.findOne(user.sub);
  }

  @Put()
  async updateProfile(
    @CurrentUser() user: AuthUserPayload,
    @Body() updateData: UpdateUserDto
  ) {
    return this.usersService.update(user.sub, updateData);
  }
}
