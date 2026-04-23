import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { FacebookAuthGuard } from './guards/facebook-auth.guard';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  CreateApiKeyDto,
  DisableTwoFactorDto,
  LoginDto,
  LogoutDto,
  RefreshTokenDto,
  RegisterDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
  VerifyTwoFactorDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthUserPayload } from './types/auth-user.type';
import { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  login(@Body() loginDto: LoginDto, @Req() request: Request) {
    const ipAddress = request.ip || request.socket.remoteAddress;
    const userAgent = request.headers['user-agent'];
    return this.authService.login(loginDto, ipAddress, userAgent);
  }

  @Post('refresh')
  refresh(@Body() refreshTokenDto: RefreshTokenDto, @Req() request: Request) {
    const ipAddress = request.ip || request.socket.remoteAddress;
    const userAgent = request.headers['user-agent'];
    return this.authService.refreshToken(refreshTokenDto, ipAddress, userAgent);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(
    @CurrentUser() user: AuthUserPayload,
    @Body() logoutDto: LogoutDto,
    @Req() request: { accessToken?: string },
  ) {
    return this.authService.logout(user, logoutDto.refreshToken, request.accessToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  logoutAllDevices(@CurrentUser() user: AuthUserPayload, @Req() request: { accessToken?: string }) {
    return this.authService.logoutAllDevices(user, request.accessToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUserPayload) {
    return this.authService.me(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(
    @CurrentUser() user: AuthUserPayload,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user, changePasswordDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/setup')
  setupTwoFactor(@CurrentUser() user: AuthUserPayload) {
    return this.authService.setupTwoFactor(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/verify')
  verifyTwoFactor(
    @CurrentUser() user: AuthUserPayload,
    @Body() verifyTwoFactorDto: VerifyTwoFactorDto,
  ) {
    return this.authService.verifyTwoFactor(user, verifyTwoFactorDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  disableTwoFactor(
    @CurrentUser() user: AuthUserPayload,
    @Body() disableTwoFactorDto: DisableTwoFactorDto,
  ) {
    return this.authService.disableTwoFactor(user, disableTwoFactorDto.password);
  }

  @UseGuards(ApiKeyAuthGuard)
  @Get('api-keys/validate')
  validateApiKey(@CurrentUser() user: AuthUserPayload) {
    return {
      valid: true,
      userId: user.sub,
      email: user.email,
      apiKeyId: user.apiKeyId,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('api-keys')
  createApiKey(@CurrentUser() user: AuthUserPayload, @Body() createApiKeyDto: CreateApiKeyDto) {
    return this.authService.createApiKey(user, createApiKeyDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('api-keys')
  listApiKeys(@CurrentUser() user: AuthUserPayload) {
    return this.authService.listApiKeys(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('api-keys/:id/rotate')
  rotateApiKey(@CurrentUser() user: AuthUserPayload, @Param('id') id: string) {
    return this.authService.rotateApiKey(user, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('api-keys/:id/revoke')
  revokeApiKey(@CurrentUser() user: AuthUserPayload, @Param('id') id: string) {
    return this.authService.revokeApiKey(user, id);
  }

  @Post('password-reset/request')
  requestPasswordReset(@Body() requestPasswordResetDto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(requestPasswordResetDto);
  }

  @Post('password-reset/reset')
  resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }
/**
   * Initiates Facebook OAuth2 login flow.
   * Redirects the user to Facebook for authentication.
   */
  @Get('facebook')
  @UseGuards(FacebookAuthGuard)
  facebookLogin() {
    // Guard handles the redirect to Facebook
  }

  /**
   * Facebook OAuth2 callback route.
   * Called by Facebook after the user authenticates.
   * Returns JWT tokens for the authenticated user.
   */
  @Get('facebook/callback')
  @UseGuards(FacebookAuthGuard)
  facebookCallback(@Req() req: any) {
    return this.authService.facebookLogin(req.user);
  }
}
