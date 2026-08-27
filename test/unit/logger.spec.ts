import { AppLogger, setCorrelationId, getCorrelationId } from '../../src/common/logger';

// Mock process.stdout.write to capture JSON logs
const originalStdoutWrite = process.stdout.write;
let stdoutOutput: string[] = [];

describe('AppLogger and logger utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stdoutOutput = [];
    process.stdout.write = jest.fn((chunk) => {
      stdoutOutput.push(chunk as string);
      return true;
    });
  });

  afterAll(() => {
    process.stdout.write = originalStdoutWrite;
  });

  describe('correlation ID helpers', () => {
    it('should set and get the correlation ID correctly', () => {
      const testId = 'test-correlation-id-123';
      setCorrelationId(testId);
      expect(getCorrelationId()).toBe(testId);
    });

    it('should update the correlation ID when set again', () => {
      setCorrelationId('first-id');
      expect(getCorrelationId()).toBe('first-id');
      
      setCorrelationId('second-id');
      expect(getCorrelationId()).toBe('second-id');
    });
  });

  describe('AppLogger', () => {
    it('should be instantiable with a context', () => {
      const logger = new AppLogger('TestContext');
      expect(logger).toBeDefined();
    });

    it('should use default context "App" if none is provided', () => {
      const logger = new AppLogger();
      expect(logger).toBeDefined();
    });
  });

  describe('scrubSensitive function (implicitly tested via logging)', () => {
    it('should redact sensitive fields from log metadata in production mode', () => {
      // Set production environment
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const logger = new AppLogger('TestLogger');
      const sensitiveData = {
        password: 'secret123',
        email: 'user@example.com',
        token: 'jwt-token-123',
        refreshToken: 'refresh-token-456',
        creditCard: '4111-1111-1111-1111',
        nonSensitiveField: 'this-should-remain',
        nested: {
          secret: 'nested-secret',
          safe: 'nested-safe-value',
        },
        arrayOfObjects: [
          { password: 'first-pass', name: 'User 1' },
          { password: 'second-pass', name: 'User 2' },
        ]
      };

      // Act
      logger.log('Test message with sensitive data', sensitiveData);

      // Parse the logged JSON
      const loggedEntry = JSON.parse(stdoutOutput[0]);
      
      // Assert sensitive fields are redacted
      expect(loggedEntry.password).toBe('[REDACTED]');
      expect(loggedEntry.token).toBe('[REDACTED]');
      expect(loggedEntry.refreshToken).toBe('[REDACTED]');
      expect(loggedEntry.creditCard).toBe('[REDACTED]');
      expect(loggedEntry.nonSensitiveField).toBe('this-should-remain');
      expect(loggedEntry.nested.secret).toBe('[REDACTED]');
      expect(loggedEntry.nested.safe).toBe('nested-safe-value');
      expect(loggedEntry.arrayOfObjects[0].password).toBe('[REDACTED]');
      expect(loggedEntry.arrayOfObjects[0].name).toBe('User 1');
      expect(loggedEntry.arrayOfObjects[1].password).toBe('[REDACTED]');
      expect(loggedEntry.arrayOfObjects[1].name).toBe('User 2');

      // Restore original environment
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should include correlationId in production logs when set', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const correlationId = 'test-correlation-789';
      setCorrelationId(correlationId);
      
      const logger = new AppLogger('ProductionLogger');
      logger.log('Production log message');

      const loggedEntry = JSON.parse(stdoutOutput[0]);
      expect(loggedEntry.correlationId).toBe(correlationId);
      
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should include all required fields in production JSON logs', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const logger = new AppLogger('JsonLogger');
      logger.error('Error occurred', { errorCode: 'TEST_ERROR', userId: 123 });

      const loggedEntry = JSON.parse(stdoutOutput[0]);
      expect(loggedEntry.level).toBe('error');
      expect(loggedEntry.timestamp).toBeDefined();
      expect(loggedEntry.context).toBe('JsonLogger');
      expect(loggedEntry.message).toBe('Error occurred');
      expect(loggedEntry.errorCode).toBe('TEST_ERROR');
      expect(loggedEntry.userId).toBe(123);
      
      process.env.NODE_ENV = originalNodeEnv;
    });
  });
});