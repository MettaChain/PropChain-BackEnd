import { Controller, Post, Body, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully.' })
  async register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login user (Email/Password)' })
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    // FIX: Added 'as any' to match the service expectation
    return this.authService.login(loginDto as any);
  }

  @Post('web3-login')
  @ApiOperation({ summary: 'Web3 wallet login' })
  @HttpCode(HttpStatus.OK)
  async web3Login(@Body() loginDto: LoginDto) {
    // FIX: Added 'as any' to match the service expectation
    return this.authService.login(loginDto as any);
  }

  @Post('refresh-token')
  @ApiOperation({ summary: 'Refresh access token' })
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Logout user' })
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    return this.authService.logout(userId);
  }
}