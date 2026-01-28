import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { UserService } from '../users/user.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { RedisService } from '../common/services/redis.service';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
  ) {}

  async register(createUserDto: CreateUserDto) {
    const user = await this.userService.create(createUserDto);
    return { message: 'User registered successfully.', user };
  }

  async login(credentials: { walletAddress: string; signature?: string }) {
    if (!credentials.walletAddress) {
      throw new BadRequestException('Wallet address required');
    }

    const user = await this.validateUserByWallet(credentials.walletAddress, credentials.signature);

    if (!user) {
      throw new UnauthorizedException('Invalid wallet credentials');
    }

    return this.generateTokens(user);
  }

  async validateUserByWallet(walletAddress: string, signature?: string): Promise<any> {
    let user = await this.userService.findByWalletAddress(walletAddress);
    
    if (!user) {
      // Cast to any because the DTO expects fields we don't use for wallet-only users
      user = await this.userService.create({
        email: `${walletAddress}@wallet.auth`,
        walletAddress,
    }
    
    return user;
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.userService.findById(payload.sub);
      
      if (!user) throw new UnauthorizedException('User not found');

      const storedToken = await this.redisService.get(`refresh_token:${payload.sub}`);
      if (storedToken !== refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return this.generateTokens(user);
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    await this.redisService.del(`refresh_token:${userId}`);
    return { message: 'Logged out successfully' };
  }

  private generateTokens(user: any) {
    const payload = { sub: user.id, email: user.email };

    // FIX: Cast expiresIn to 'any' to satisfy the JwtSignOptions overload requirements
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: (this.configService.get<string>('JWT_EXPIRES_IN') as any) || '24h',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') as any) || '7d',
    });

    // FIX: Ensure parseInt only receives the string and radix
    const refreshExpiresInSeconds = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN_SECONDS') || '604800';
    const expiresSeconds = parseInt(refreshExpiresInSeconds, 10);
    
    this.redisService.setex(
      `refresh_token:${user.id}`,
      expiresSeconds,
      refreshToken
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        walletAddress: user.walletAddress,
      },
    };
  }
}