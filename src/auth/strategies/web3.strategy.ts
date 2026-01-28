import { Strategy } from 'passport-custom';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ethers } from 'ethers';
import { UserService } from '../../users/user.service';

@Injectable()
export class Web3Strategy extends PassportStrategy(Strategy, 'web3') {
  constructor(private userService: UserService) {
    super();
  }

  async validate(req: any) {
    const { walletAddress, signature } = req.body;

    if (!walletAddress || !signature) {
      throw new UnauthorizedException('Wallet address and signature are required');
    }

    // Verify the signature
    const isValid = await this.verifySignature(walletAddress, signature);
    
    if (!isValid) {
      throw new UnauthorizedException('Invalid signature');
    }

    // Find or create user
    let user = await this.userService.findByWalletAddress(walletAddress);
    
    if (!user) {
      // Create user if doesn't exist
      user = await this.userService.create({
        email: `${walletAddress}@wallet.auth`,
        password: Math.random().toString(36),
        walletAddress,
        firstName: `User-${walletAddress.slice(0, 8)}`,
        lastName: `Wallet-${walletAddress.slice(0, 8)}`,
      });
    }

    return user;
  }

  private async verifySignature(walletAddress: string, signature: string): Promise<boolean> {
    try {
      // Create a message to verify against (in a real app, this would be a challenge)
      const message = `Welcome to PropChain!

Click to sign in and accept the Terms of Service.

Timestamp: ${Date.now()}`;
      
      // Recover the address from the signature
      const recoveredAddress = ethers.verifyMessage(message, signature);
      
      // Compare the recovered address with the provided wallet address
      return recoveredAddress.toLowerCase() === walletAddress.toLowerCase();
    } catch (error) {
      console.error('Error verifying signature:', error);
      return false;
    }
  }
}