import { Controller, Post, Get, Delete, Body, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { MfaService } from './mfa.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';

@ApiTags('mfa')
@Controller('mfa')
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  @Post('setup')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Generate MFA setup QR code' })
  @ApiResponse({ status: 200, description: 'MFA setup initiated successfully.' })
  @HttpCode(HttpStatus.OK)
  async setupMfa(@Req() req: Request) {
    const user = req['user'] as any;
    return this.mfaService.generateMfaSecret(user.id, user.email);
  }

  @Post('verify')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Verify and complete MFA setup' })
  @ApiResponse({ status: 200, description: 'MFA setup completed successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid MFA token.' })
  @HttpCode(HttpStatus.OK)
  async verifyMfa(@Req() req: Request, @Body('token') token: string) {
    const user = req['user'] as any;
    const verified = await this.mfaService.verifyMfaSetup(user.id, token);

    if (verified) {
      // Generate backup codes after successful setup
      const backupCodes = await this.mfaService.generateBackupCodes(user.id);
      return {
        message: 'MFA setup completed successfully',
        backupCodes,
      };
    }

    throw new Error('Invalid MFA token');
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get MFA status for current user' })
  @ApiResponse({ status: 200, description: 'MFA status retrieved successfully.' })
  @HttpCode(HttpStatus.OK)
  async getMfaStatus(@Req() req: Request) {
    const user = req['user'] as any;
    return this.mfaService.getMfaStatus(user.id);
  }

  @Delete('disable')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Disable MFA for current user' })
  @ApiResponse({ status: 200, description: 'MFA disabled successfully.' })
  @HttpCode(HttpStatus.OK)
  async disableMfa(@Req() req: Request) {
    const user = req['user'] as any;
    await this.mfaService.disableMfa(user.id);
    return { message: 'MFA disabled successfully' };
  }

  @Post('backup-codes')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Generate new backup codes' })
  @ApiResponse({ status: 200, description: 'Backup codes generated successfully.' })
  @HttpCode(HttpStatus.OK)
  async generateBackupCodes(@Req() req: Request) {
    const user = req['user'] as any;
    const backupCodes = await this.mfaService.generateBackupCodes(user.id);
    return { backupCodes };
  }

  @Post('verify-backup')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Verify backup code' })
  @ApiResponse({ status: 200, description: 'Backup code verified successfully.' })
  @ApiResponse({ status: 401, description: 'Invalid backup code.' })
  @HttpCode(HttpStatus.OK)
  async verifyBackupCode(@Req() req: Request, @Body('code') code: string) {
    const user = req['user'] as any;
    const verified = await this.mfaService.verifyBackupCode(user.id, code);

    if (!verified) {
      throw new Error('Invalid backup code');
    }

    return { message: 'Backup code verified successfully' };
  }
}
