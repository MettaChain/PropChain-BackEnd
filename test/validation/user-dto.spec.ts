import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateUserDto } from '../../src/users/dto';

describe('User DTOs', () => {
  describe('CreateUserDto', () => {
    const validUserData = {
      email: 'john.doe@example.com',
      firstName: 'John',
      lastName: 'Doe',
      password: 'SecureP@ss123',
    };

    it('should pass with valid user data', async () => {
      const dto = plainToInstance(CreateUserDto, validUserData);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with optional wallet address', async () => {
      const dto = plainToInstance(CreateUserDto, {
        ...validUserData,
        walletAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with invalid email', async () => {
      const dto = plainToInstance(CreateUserDto, {
        ...validUserData,
        email: 'invalid-email',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('email');
    });

    it('should fail with email too long', async () => {
      const dto = plainToInstance(CreateUserDto, {
        ...validUserData,
        email: 'a'.repeat(250) + '@example.com',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with empty first name', async () => {
      const dto = plainToInstance(CreateUserDto, {
        ...validUserData,
        firstName: '',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with first name containing numbers', async () => {
      const dto = plainToInstance(CreateUserDto, {
        ...validUserData,
        firstName: 'John123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const matchesError = errors.find(e => e.property === 'firstName' && e.constraints?.matches);
      expect(matchesError).toBeDefined();
    });

    it('should pass with hyphenated names', async () => {
      const dto = plainToInstance(CreateUserDto, {
        ...validUserData,
        firstName: 'Mary-Jane',
        lastName: "O'Connor",
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with first name too long', async () => {
      const dto = plainToInstance(CreateUserDto, {
        ...validUserData,
        firstName: 'A'.repeat(51),
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with weak password', async () => {
      const dto = plainToInstance(CreateUserDto, {
        ...validUserData,
        password: 'weak',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with password missing uppercase', async () => {
      const dto = plainToInstance(CreateUserDto, {
        ...validUserData,
        password: 'securep@ss123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with password too short', async () => {
      const dto = plainToInstance(CreateUserDto, {
        ...validUserData,
        password: 'Ab@1',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with invalid wallet address', async () => {
      const dto = plainToInstance(CreateUserDto, {
        ...validUserData,
        walletAddress: 'invalid-wallet',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const walletError = errors.find(e => e.property === 'walletAddress');
      expect(walletError).toBeDefined();
    });

    it('should fail with all fields missing', async () => {
      const dto = plainToInstance(CreateUserDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(4); // email, firstName, lastName, password
    });
  });
});
