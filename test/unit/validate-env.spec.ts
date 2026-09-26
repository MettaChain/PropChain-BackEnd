import { Logger } from '@nestjs/common';
import { validateEnvironment, validateBlockchainEnvironment } from '../../src/utils/validate-env';

describe('validateEnvironment', () => {
  const originalEnv = { ...process.env };
  const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  const mockLoggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    // Reset process.env to a clean state without any required vars
    process.env = { ...originalEnv };
    delete process.env.DATABASE_URL;
    delete process.env.JWT_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    // Blockchain validation is opt-in per the #1178 checks; keep the rest of
    // the suite independent of it.
    process.env.BLOCKCHAIN_ENABLED = 'false';
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
    process.env.RECAPTCHA_SECRET = 'test-recaptcha-secret';

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
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.JWT_SECRET = 'tooshortsecretx'; // 15 chars
    process.env.JWT_REFRESH_SECRET = 'thisisanotherlongenoughsecretkeythatis32charsmin';

    validateEnvironment();

    expect(mockLoggerError).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(1);
    const errorMessage = mockLoggerError.mock.calls[0][0];
    expect(errorMessage).toContain('Environment variables below the minimum required length');
    expect(errorMessage).toContain('JWT_SECRET (found 15 chars, need at least 32)');
  });

  it('should log an error and exit with code 1 when JWT_REFRESH_SECRET is too short (less than 32 characters)', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.JWT_SECRET = 'thisisalongenoughsecretkeythatis32charsmin';
    process.env.JWT_REFRESH_SECRET = 'tooshortrefreshsecre'; // 20 chars

    validateEnvironment();

    expect(mockLoggerError).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(1);
    const errorMessage = mockLoggerError.mock.calls[0][0];
    expect(errorMessage).toContain('Environment variables below the minimum required length');
    expect(errorMessage).toContain('JWT_REFRESH_SECRET (found 20 chars, need at least 32)');
  });

  it('should log an error and exit with code 1 when both JWT secrets are too short', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.JWT_SECRET = 'tooshortsecretx'; // 15 chars
    process.env.JWT_REFRESH_SECRET = 'tooshortrefreshsecre'; // 20 chars

    validateEnvironment();

    expect(mockLoggerError).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(1);
    const errorMessage = mockLoggerError.mock.calls[0][0];
    expect(errorMessage).toContain('Environment variables below the minimum required length');
    expect(errorMessage).toContain('JWT_SECRET (found 15 chars, need at least 32)');
    expect(errorMessage).toContain('JWT_REFRESH_SECRET (found 20 chars, need at least 32)');
  });

  it('should log both missing variables and weak secrets in the same error message', () => {
    process.env.JWT_SECRET = 'tooshortsecretx'; // 15 chars
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
    process.env.RECAPTCHA_SECRET = 'test-recaptcha-secret';

    validateEnvironment();

    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('should log an error and exit when RECAPTCHA_SECRET is missing and CAPTCHA is required', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.JWT_SECRET = 'thisisalongenoughsecretkeythatis32charsmin';
    process.env.JWT_REFRESH_SECRET = 'thisisanotherlongenoughsecretkeythatis32charsmin';
    delete process.env.RECAPTCHA_SECRET;
    delete process.env.CAPTCHA_BYPASS;

    validateEnvironment();

    expect(mockLoggerError).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(1);
    const errorMessage = mockLoggerError.mock.calls[0][0];
    expect(errorMessage).toContain('RECAPTCHA_SECRET');
  });

  it('should not require RECAPTCHA_SECRET when CAPTCHA_BYPASS=true', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.JWT_SECRET = 'thisisalongenoughsecretkeythatis32charsmin';
    process.env.JWT_REFRESH_SECRET = 'thisisanotherlongenoughsecretkeythatis32charsmin';
    delete process.env.RECAPTCHA_SECRET;
    process.env.CAPTCHA_BYPASS = 'true';

    validateEnvironment();

    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(mockExit).not.toHaveBeenCalled();
  });
});

describe('validateBlockchainEnvironment (#1178)', () => {
  const originalEnv = { ...process.env };

  function setValidBlockchainEnv(): void {
    process.env.BLOCKCHAIN_ENABLED = 'true';
    process.env.BLOCKCHAIN_RPC_URL = 'https://sepolia.infura.io/v3/validprojectid';
    process.env.BLOCKCHAIN_CONTRACT_ADDRESS = '0x52908400098527886E0F7030069857D2E4169EE7';
    process.env.BLOCKCHAIN_PRIVATE_KEY = '0x' + 'a1'.repeat(32);
  }

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.BLOCKCHAIN_ENABLED;
    delete process.env.BLOCKCHAIN_RPC_URL;
    delete process.env.BLOCKCHAIN_CONTRACT_ADDRESS;
    delete process.env.BLOCKCHAIN_PRIVATE_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns no errors when BLOCKCHAIN_ENABLED is false, regardless of placeholders', () => {
    process.env.BLOCKCHAIN_ENABLED = 'false';
    process.env.BLOCKCHAIN_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000';
    expect(validateBlockchainEnvironment()).toEqual([]);
  });

  it('returns no errors for a valid, checksummed configuration', () => {
    setValidBlockchainEnv();
    expect(validateBlockchainEnvironment()).toEqual([]);
  });

  it('rejects the zero-address placeholder contract address', () => {
    setValidBlockchainEnv();
    process.env.BLOCKCHAIN_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000';
    const errors = validateBlockchainEnvironment();
    expect(errors.join(' ')).toContain('zero address');
  });

  it('rejects a non-checksummed contract address', () => {
    setValidBlockchainEnv();
    // Flip one hex letter's case to break the EIP-55 checksum.
    process.env.BLOCKCHAIN_CONTRACT_ADDRESS = '0x52908400098527886E0F7030069857D2E4169eE7';
    const errors = validateBlockchainEnvironment();
    expect(errors.join(' ')).toContain('checksum');
  });

  it('rejects a placeholder RPC URL and missing private key', () => {
    setValidBlockchainEnv();
    process.env.BLOCKCHAIN_RPC_URL = 'https://sepolia.infura.io/v3/YOUR_INFURA_KEY';
    delete process.env.BLOCKCHAIN_PRIVATE_KEY;
    const errors = validateBlockchainEnvironment().join(' ');
    expect(errors).toContain('BLOCKCHAIN_RPC_URL');
    expect(errors).toContain('BLOCKCHAIN_PRIVATE_KEY');
  });

  it('requires BLOCKCHAIN_CONTRACT_ADDRESS when enabled', () => {
    setValidBlockchainEnv();
    delete process.env.BLOCKCHAIN_CONTRACT_ADDRESS;
    const errors = validateBlockchainEnvironment().join(' ');
    expect(errors).toContain('BLOCKCHAIN_CONTRACT_ADDRESS is required');
  });
});
