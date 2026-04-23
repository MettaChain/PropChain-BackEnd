import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { EmailVerificationService } from './email-verification.service';
import { ChangeEmailDto, VerifyEmailDto } from './dto/email-change.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('users/email')
export class EmailVerificationController {
  constructor(private readonly emailVerificationService: EmailVerificationService) {}

  @Post('change')
  requestEmailChange(@CurrentUser() user: any, @Body() changeEmailDto: ChangeEmailDto) {
    return this.emailVerificationService.requestEmailChange(user.id, changeEmailDto);
  }

  @Post('verify')
  verifyEmailChange(@CurrentUser() user: any, @Body() verifyEmailDto: VerifyEmailDto) {
    return this.emailVerificationService.verifyEmailChange(user.id, verifyEmailDto.token);
  }

  @Post('cancel-change')
  cancelEmailChange(@CurrentUser() user: any) {
    return this.emailVerificationService.cancelEmailChange(user.id);
  }
}
