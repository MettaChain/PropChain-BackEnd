import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
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
  UpdateApiKeyPermissionsDto,
  VerifyTwoFactorDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { AuthUserPayload } from './types/auth-user.type';
import { GoogleProfile } from './strategies/google.strategy';
import { UserRole } from '../types/prisma.types';
import { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @UseGuards(GoogleAuthGuard)
  @Get('google')
  googleLogin() {
    // Initiates Google OAuth2 redirect — handled by passport
  }

  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  googleCallback(@Req() req: { user: GoogleProfile }) {
    return this.authService.googleOAuthLogin(req.user);
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

  @UseGuards(JwtAuthGuard)
  @Patch('api-keys/:id/permissions')
  updateApiKeyPermissions(
    @CurrentUser() user: AuthUserPayload,
    @Param('id') id: string,
    @Body() updateApiKeyPermissionsDto: UpdateApiKeyPermissionsDto,
  ) {
    return this.authService.updateApiKeyPermissions(user, id, updateApiKeyPermissionsDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('api-keys/:id/usage')
  getApiKeyUsage(@CurrentUser() user: AuthUserPayload, @Param('id') id: string) {
    return this.authService.getApiKeyUsage(user, id);
  }

  @Post('password-reset/request')
  requestPasswordReset(@Body() requestPasswordResetDto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(requestPasswordResetDto);
  }

  @Post('password-reset/reset')
  resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('unlock-account')
  unlockAccount(@Body() data: { email: string }) {
    return this.authService.unlockAccount(data.email);
  }

  @Post('login-status')
  getLoginStatus(@Body() data: { email: string }) {
    return this.authService.getLoginStatus(data.email);
  }
}
