import { Logger } from '@nestjs/common';
import { validateEnvironment } from '../../src/utils/validate-env';

describe('validateEnvironment', () => {
  const originalEnv = { ...process.env };
  const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  const mockLoggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    // Reset process.env to original state before each test
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original implementations
    mockExit.mockRestore();
    mockLoggerError.mockRestore();
    // Restore original process.env
    process.env = originalEnv;
  });

  it('should not exit or log errors when all required environment variables are present and valid', () => {
    // Set all required variables with valid lengths (min 32 chars)
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.JWT_SECRET = 'thisisalongenoughsecretkeythatis32charsmin';
    process.env.JWT_REFRESH_SECRET = 'thisisanotherlongenoughsecretkeythatis32charsmin';

    validateEnvironment();

    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('should log an error and exit with code 1 when DATABASE_URL is missing', () => {
    // Only set JWT secrets, missing DATABASE_URL
    process.env.JWT_SECRET = 'thisisalongenoughsecretkeythatis32charsmin';
    process.env.JWT_REFRESH_SECRET = 'thisisanotherlongenoughsecretkeythatis32charsmin';

    validateEnvironment();

    expect(mockLoggerError).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(1);
    const errorMessage = mockLoggerError.mock.calls[0][0];
    expect(errorMessage).toContain('Missing required environment variables');
    expect(errorMessage).toContain('DATABASE_URL');
  });

  it('should log an error and exit with code 1 when JWT_SECRET is missing', () => {
    // Only set DATABASE_URL and JWT_REFRESH_SECRET, missing JWT_SECRET
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.JWT_REFRESH_SECRET = 'thisisanotherlongenoughsecretkeythatis32charsmin';

    validateEnvironment();

    expect(mockLoggerError).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(1);
    const errorMessage = mockLoggerError.mock.calls[0][0];
    expect(errorMessage).toContain('Missing required environment variables');
    expect(errorMessage).toContain('JWT_SECRET');
  });

  it('should log an error and exit with code 1 when JWT_REFRESH_SECRET is missing', () => {
    // Only set DATABASE_URL and JWT_SECRET, missing JWT_REFRESH_SECRET
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.JWT_SECRET = 'thisisalongenoughsecretkeythatis32charsmin';

    validateEnvironment();

    expect(mockLoggerError).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(1);
    const errorMessage = mockLoggerError.mock.calls[0][0];
    expect(errorMessage).toContain('Missing required environment variables');
    expect(errorMessage).toContain('JWT_REFRESH_SECRET');
  });

  it('should log an error and exit with code 1 when all required environment variables are missing', () => {
    // Don't set any required variables

    validateEnvironment();

    expect(mockLoggerError).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(1);
    const errorMessage = mockLoggerError.mock.calls[0][0];
    expect(errorMessage).toContain('Missing required environment variables');
    expect(errorMessage).toContain('DATABASE_URL');
    expect(errorMessage).toContain('JWT_SECRET');
    expect(errorMessage).toContain('JWT_REFRESH_SECRET');
  });

  it('should log an error and exit with code 1 when JWT_SECRET is too short (less than 32 characters)', () => {
    // Set all required variables, but JWT_SECRET is only 20 characters long
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.JWT_SECRET = 'tooshortsecretkey'; // 15 chars
    process.env.JWT_REFRESH_SECRET = 'thisisanotherlongenoughsecretkeythatis32charsmin';

    validateEnvironment();

    expect(mockLoggerError).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(1);
    const errorMessage = mockLoggerError.mock.calls[0][0];
    expect(errorMessage).toContain('Environment variables below the minimum required length');
    expect(errorMessage).toContain('JWT_SECRET (found 15 chars, need at least 32)');
  });

  it('should log an error and exit with code 1 when JWT_REFRESH_SECRET is too short (less than 32 characters)', () => {
    // Set all required variables, but JWT_REFRESH_SECRET is only 25 characters long
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.JWT_SECRET = 'thisisalongenoughsecretkeythatis32charsmin';
    process.env.JWT_REFRESH_SECRET = 'tooshortrefreshsecret'; // 20 chars

    validateEnvironment();

    expect(mockLoggerError).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(1);
    const errorMessage = mockLoggerError.mock.calls[0][0];
    expect(errorMessage).toContain('Environment variables below the minimum required length');
    expect(errorMessage).toContain('JWT_REFRESH_SECRET (found 20 chars, need at least 32)');
  });

  it('should log an error and exit with code 1 when both JWT secrets are too short', () => {
    // Set all required variables, but both JWT secrets are too short
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.JWT_SECRET = 'tooshortsecretkey'; // 15 chars
    process.env.JWT_REFRESH_SECRET = 'tooshortrefreshsecret'; // 20 chars

    validateEnvironment();

    expect(mockLoggerError).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(1);
    const errorMessage = mockLoggerError.mock.calls[0][0];
    expect(errorMessage).toContain('Environment variables below the minimum required length');
    expect(errorMessage).toContain('JWT_SECRET (found 15 chars, need at least 32)');
    expect(errorMessage).toContain('JWT_REFRESH_SECRET (found 20 chars, need at least 32)');
  });

  it('should log both missing variables and weak secrets in the same error message', () => {
    // Missing DATABASE_URL, and JWT_SECRET is too short
    process.env.JWT_SECRET = 'tooshortsecretkey'; // 15 chars
    process.env.JWT_REFRESH_SECRET = 'thisisanotherlongenoughsecretkeythatis32charsmin';

    validateEnvironment();

    expect(mockLoggerError).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(1);
    const errorMessage = mockLoggerError.mock.calls[0][0];
    expect(errorMessage).toContain('Missing required environment variables');
    expect(errorMessage).toContain('DATABASE_URL');
    expect(errorMessage).toContain('Environment variables below the minimum required length');
    expect(errorMessage).toContain('JWT_SECRET (found 15 chars, need at least 32)');
  });

  it('should handle JWT secrets that are exactly 32 characters long (minimum valid length)', () => {
    // Set all required variables with JWT secrets exactly 32 characters long
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);

    validateEnvironment();

    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(mockExit).not.toHaveBeenCalled();
  });
});