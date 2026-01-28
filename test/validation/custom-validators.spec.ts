import { validate } from 'class-validator';
import { IsEthereumAddress } from '../../src/common/validators/is-ethereum-address.validator';
import { IsStrongPassword } from '../../src/common/validators/is-strong-password.validator';

class TestEthereumAddressDto {
  @IsEthereumAddress()
  walletAddress: string;
}

class TestStrongPasswordDto {
  @IsStrongPassword()
  password: string;
}

describe('Custom Validators', () => {
  describe('IsEthereumAddress', () => {
    it('should pass with valid Ethereum address', async () => {
      const dto = new TestEthereumAddressDto();
      dto.walletAddress = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with lowercase Ethereum address', async () => {
      const dto = new TestEthereumAddressDto();
      dto.walletAddress = '0x742d35cc6634c0532925a3b844bc454e4438f44e';
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with uppercase Ethereum address', async () => {
      const dto = new TestEthereumAddressDto();
      dto.walletAddress = '0x742D35CC6634C0532925A3B844BC454E4438F44E';
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail without 0x prefix', async () => {
      const dto = new TestEthereumAddressDto();
      dto.walletAddress = '742d35Cc6634C0532925a3b844Bc454e4438f44e';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with too short address', async () => {
      const dto = new TestEthereumAddressDto();
      dto.walletAddress = '0x742d35Cc6634C0532925a3b844Bc454e';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with too long address', async () => {
      const dto = new TestEthereumAddressDto();
      dto.walletAddress = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e123';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with invalid characters', async () => {
      const dto = new TestEthereumAddressDto();
      dto.walletAddress = '0xGGGd35Cc6634C0532925a3b844Bc454e4438f44e';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with empty string', async () => {
      const dto = new TestEthereumAddressDto();
      dto.walletAddress = '';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('IsStrongPassword', () => {
    it('should pass with strong password', async () => {
      const dto = new TestStrongPasswordDto();
      dto.password = 'SecureP@ss123';
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with various special characters', async () => {
      const specialChars = ['@', '$', '!', '%', '*', '?', '&', '#'];
      for (const char of specialChars) {
        const dto = new TestStrongPasswordDto();
        dto.password = `SecureP${char}ss123`;
        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      }
    });

    it('should fail with password too short', async () => {
      const dto = new TestStrongPasswordDto();
      dto.password = 'Abc@12';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail without uppercase letter', async () => {
      const dto = new TestStrongPasswordDto();
      dto.password = 'securep@ss123';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail without lowercase letter', async () => {
      const dto = new TestStrongPasswordDto();
      dto.password = 'SECUREP@SS123';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail without number', async () => {
      const dto = new TestStrongPasswordDto();
      dto.password = 'SecureP@ssword';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail without special character', async () => {
      const dto = new TestStrongPasswordDto();
      dto.password = 'SecurePass123';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with empty string', async () => {
      const dto = new TestStrongPasswordDto();
      dto.password = '';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
