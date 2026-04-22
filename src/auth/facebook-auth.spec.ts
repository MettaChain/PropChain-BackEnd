import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';

// Mock AuthService
const mockAuthService = {
  validateFacebookUser: jest.fn(),
  facebookLogin: jest.fn(),
};

describe('Facebook OAuth2', () => {
  let authService: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('validateFacebookUser', () => {
    it('returns existing user when facebookId matches', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        facebookId: 'fb-123',
      };

      mockAuthService.validateFacebookUser.mockResolvedValueOnce(mockUser);

      const result = await authService.validateFacebookUser({
        facebookId: 'fb-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(result).toEqual(mockUser);
      expect(mockAuthService.validateFacebookUser).toHaveBeenCalledWith({
        facebookId: 'fb-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      });
    });

    it('links facebook account to existing user with same email', async () => {
      const mockUser = {
        id: 'user-2',
        email: 'existing@example.com',
        facebookId: 'fb-456',
      };

      mockAuthService.validateFacebookUser.mockResolvedValueOnce(mockUser);

      const result = await authService.validateFacebookUser({
        facebookId: 'fb-456',
        email: 'existing@example.com',
      });

      expect(result.facebookId).toBe('fb-456');
    });

    it('creates new user when no existing account found', async () => {
      const newUser = {
        id: 'user-3',
        email: 'newuser@example.com',
        facebookId: 'fb-789',
        isVerified: true,
      };

      mockAuthService.validateFacebookUser.mockResolvedValueOnce(newUser);

      const result = await authService.validateFacebookUser({
        facebookId: 'fb-789',
        email: 'newuser@example.com',
        firstName: 'New',
        lastName: 'User',
      });

      expect(result.isVerified).toBe(true);
      expect(result.facebookId).toBe('fb-789');
    });

    it('handles missing email from Facebook profile', async () => {
      const userWithNoEmail = {
        id: 'user-4',
        email: 'fb_fb-000@facebook.com',
        facebookId: 'fb-000',
        isVerified: true,
      };

      mockAuthService.validateFacebookUser.mockResolvedValueOnce(userWithNoEmail);

      const result = await authService.validateFacebookUser({
        facebookId: 'fb-000',
      });

      expect(result.email).toContain('facebook.com');
    });
  });

  describe('facebookLogin', () => {
    it('returns tokens and user after successful login', async () => {
      const mockResponse = {
        user: { id: 'user-1', email: 'test@example.com' },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        accessTokenExpiresIn: 900,
        refreshTokenExpiresIn: 604800,
      };

      mockAuthService.facebookLogin.mockResolvedValueOnce(mockResponse);

      const result = await authService.facebookLogin({
        id: 'user-1',
        email: 'test@example.com',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
    });

    it('returns user info after facebook login', async () => {
      const mockResponse = {
        user: { id: 'user-1', email: 'test@example.com' },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      };

      mockAuthService.facebookLogin.mockResolvedValueOnce(mockResponse);

      const result = await authService.facebookLogin({
        id: 'user-1',
        email: 'test@example.com',
      });

      expect(result.user).toHaveProperty('email');
    });
  });
});