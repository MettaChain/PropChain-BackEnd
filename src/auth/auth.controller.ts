import { Controller, Post, Body, Req, Get, UseGuards, HttpCode, HttpStatus, Put, Param, Delete } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginAttemptsGuard } from './guards/login-attempts.guard';
import { CreateUserDto } from '../users/dto/create-user.dto';
import {
  LoginDto,
  LoginWeb3Dto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailParamsDto,
} from './dto';
import { ErrorResponseDto } from '../common/errors/error.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully.' })
  @ApiResponse({ status: 409, description: 'User already exists.', type: ErrorResponseDto })
  @ApiResponse({ status: 400, description: 'Validation failed.', type: ErrorResponseDto })
  async register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @Post('login')
  @UseGuards(LoginAttemptsGuard)
  @ApiOperation({ summary: 'Login user with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.', type: ErrorResponseDto })
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto, @Req() req: Request) {
    return this.authService.login({
      email: loginDto.email,
      password: loginDto.password,
    });
  }

  @Post('web3-login')
  @ApiOperation({ summary: 'Web3 wallet login' })
  @ApiResponse({ status: 200, description: 'Web3 login successful.' })
  @ApiResponse({ status: 401, description: 'Invalid signature.', type: ErrorResponseDto })
  @HttpCode(HttpStatus.OK)
  async web3Login(@Body() loginDto: LoginWeb3Dto) {
    return this.authService.login({
      walletAddress: loginDto.walletAddress,
      signature: loginDto.signature,
    });
  }

  @Post('refresh-token')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully.' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token.', type: ErrorResponseDto })
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'Logged out successfully.' })
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request) {
    const user = req['user'] as any;
    const authHeader = req.headers['authorization'];
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
    return this.authService.logout(user.id, accessToken);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset' })
  @ApiResponse({ status: 200, description: 'Password reset email sent.' })
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

  @Put('reset-password')
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({ status: 200, description: 'Password reset successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid or expired reset token.', type: ErrorResponseDto })
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto.token, resetPasswordDto.newPassword);
  }

  @Get('verify-email/:token')
  @ApiOperation({ summary: 'Verify email address' })
  @ApiResponse({ status: 200, description: 'Email verified successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid or expired verification token.', type: ErrorResponseDto })
  async verifyEmail(@Param() params: VerifyEmailParamsDto) {
    return this.authService.verifyEmail(params.token);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all active sessions for current user' })
  @ApiResponse({ status: 200, description: 'Sessions retrieved successfully.' })
  @HttpCode(HttpStatus.OK)
  async getSessions(@Req() req: Request) {
    const user = req['user'] as any;
    return this.authService.getAllUserSessions(user.id);
  }

  @Delete('sessions/:sessionId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Invalidate a specific session' })
  @ApiResponse({ status: 200, description: 'Session invalidated successfully.' })
  @HttpCode(HttpStatus.OK)
  async invalidateSession(@Req() req: Request, @Param('sessionId') sessionId: string) {
    const user = req['user'] as any;
    await this.authService.invalidateSession(user.id, sessionId);
    return { message: 'Session invalidated successfully' };
  }

  @Delete('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Invalidate all sessions for current user' })
  @ApiResponse({ status: 200, description: 'All sessions invalidated successfully.' })
  @HttpCode(HttpStatus.OK)
  async invalidateAllSessions(@Req() req: Request) {
    const user = req['user'] as any;
    await this.authService.invalidateAllSessions(user.id);
    return { message: 'All sessions invalidated successfully' };
  }
}
