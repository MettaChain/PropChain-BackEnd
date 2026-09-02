import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CommissionsService } from './commissions.service';
import { CommissionListQueryDto } from './dto/commission.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserPayload } from '../auth/types/auth-user.type';

@Controller('commissions')
@UseGuards(JwtAuthGuard)
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Get()
  async findAll(@Query() query: CommissionListQueryDto, @CurrentUser() user: AuthUserPayload) {
    return this.commissionsService.findAll(query, user);
  }

  @Get('stats')
  async getStats(@CurrentUser() user: AuthUserPayload) {
    return this.commissionsService.getStats(user);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthUserPayload) {
    return this.commissionsService.findOne(id, user);
  }
}
