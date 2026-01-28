import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  LoginDto,
  LoginEmailDto,
  LoginWeb3Dto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from '../../src/auth/dto';

describe('Auth DTOs', () => {
  describe('LoginEmailDto', () => {
    it('should pass with valid email and password', async () => {
      const dto = plainToInstance(LoginEmailDto, {
        email: 'test@example.com',
        password: 'password123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with invalid email', async () => {
      const dto = plainToInstance(LoginEmailDto, {
        email: 'invalid-email',
        password: 'password123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('email');
    });

    it('should fail with empty email', async () => {
      const dto = plainToInstance(LoginEmailDto, {
        email: '',
        password: 'password123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with empty password', async () => {
      const dto = plainToInstance(LoginEmailDto, {
        email: 'test@example.com',
        password: '',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with missing fields', async () => {
      const dto = plainToInstance(LoginEmailDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(2);
    });
  });

  describe('LoginWeb3Dto', () => {
    it('should pass with valid wallet address and signature', async () => {
      const dto = plainToInstance(LoginWeb3Dto, {
        walletAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        signature: '0xabcdef1234567890',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with invalid wallet address', async () => {
      const dto = plainToInstance(LoginWeb3Dto, {
        walletAddress: 'invalid-address',
        signature: '0xabcdef1234567890',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('walletAddress');
    });

    it('should fail with empty signature', async () => {
      const dto = plainToInstance(LoginWeb3Dto, {
        walletAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        signature: '',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('LoginDto (Combined)', () => {
    it('should pass with email and password', async () => {
      const dto = plainToInstance(LoginDto, {
        email: 'test@example.com',
        password: 'password123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with wallet address and signature', async () => {
      const dto = plainToInstance(LoginDto, {
        walletAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        signature: '0xabcdef1234567890',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with neither email nor wallet', async () => {
      const dto = plainToInstance(LoginDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('RefreshTokenDto', () => {
    it('should pass with valid JWT', async () => {
      const dto = plainToInstance(RefreshTokenDto, {
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with invalid JWT format', async () => {
      const dto = plainToInstance(RefreshTokenDto, {
        refreshToken: 'not-a-jwt',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with empty token', async () => {
      const dto = plainToInstance(RefreshTokenDto, {
        refreshToken: '',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('ForgotPasswordDto', () => {
    it('should pass with valid email', async () => {
      const dto = plainToInstance(ForgotPasswordDto, {
        email: 'test@example.com',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with invalid email', async () => {
      const dto = plainToInstance(ForgotPasswordDto, {
        email: 'invalid-email',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with empty email', async () => {
      const dto = plainToInstance(ForgotPasswordDto, {
        email: '',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('ResetPasswordDto', () => {
    it('should pass with valid token and strong password', async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        token: 'valid-reset-token-abc123',
        newPassword: 'SecureP@ss123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with weak password', async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        token: 'valid-token',
        newPassword: 'weak',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with password missing special character', async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        token: 'valid-token',
        newPassword: 'SecurePass123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with empty token', async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        token: '',
        newPassword: 'SecureP@ss123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with password too long', async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        token: 'valid-token',
        newPassword: 'A'.repeat(129) + '@1a',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
