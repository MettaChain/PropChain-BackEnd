import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards } from '@nestjs/common';
import { UserPreferencesService } from './user-preferences.service';
import { CreateUserPreferencesDto, UpdateUserPreferencesDto } from './dto/user-preferences.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('users/preferences')
export class UserPreferencesController {
  constructor(private readonly preferencesService: UserPreferencesService) {}

  @Get()
  getPreferences(@CurrentUser() user: any) {
    return this.preferencesService.findByUserId(user.id);
  }

  @Post()
  createPreferences(@CurrentUser() user: any, @Body() createDto: CreateUserPreferencesDto) {
    return this.preferencesService.create(user.id, createDto);
  }

  @Put()
  updatePreferences(@CurrentUser() user: any, @Body() updateDto: UpdateUserPreferencesDto) {
    return this.preferencesService.update(user.id, updateDto);
  }

  @Delete()
  removePreferences(@CurrentUser() user: any) {
    return this.preferencesService.remove(user.id);
  }
}
