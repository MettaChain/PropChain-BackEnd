import { VersionHeaderInterceptor } from './version-header.interceptor';
import { ExecutionContext, CallHandler, BadRequestException } from '@nestjs/common';
import { of } from 'rxjs';
import { SUPPORTED_API_VERSIONS, DEFAULT_API_VERSION } from './api-version.constants';

describe('VersionHeaderInterceptor', () => {
  let interceptor: VersionHeaderInterceptor;
  let mockExecutionContext: Partial<ExecutionContext>;
  let mockCallHandler: Partial<CallHandler>;
  let mockRequest: any;
  let mockResponse: any;
  let mockSetHeader: jest.Mock;

  beforeEach(() => {
    interceptor = new VersionHeaderInterceptor();
    mockSetHeader = jest.fn();
    mockResponse = { setHeader: mockSetHeader };

    mockRequest = {
      path: '/api/v2/users',
      headers: {},
    };

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
        getResponse: jest.fn().mockReturnValue(mockResponse),
      }),
    };

    mockCallHandler = {
      handle: jest.fn().mockReturnValue(of({ data: 'test' })),
    };
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('version extraction from different sources', () => {
    it('should extract version from URL path first', (done) => {
      mockRequest.path = '/api/v1/users';

      interceptor
        .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
        .subscribe({
          next: () => {
            expect(mockSetHeader).toHaveBeenCalledWith('API-Version', 'v1');
            done();
          },
          error: done,
        });
    });

    it('should extract version from API-Version header if not in URL', (done) => {
      mockRequest.path = '/api/users';
      mockRequest.headers['api-version'] = 'v1';

      interceptor
        .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
        .subscribe({
          next: () => {
            expect(mockSetHeader).toHaveBeenCalledWith('API-Version', 'v1');
            done();
          },
          error: done,
        });
    });

    it('should extract version from Accept header if not in URL or header', (done) => {
      mockRequest.path = '/api/users';
      mockRequest.headers['accept'] = 'application/json; version=v1';

      interceptor
        .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
        .subscribe({
          next: () => {
            expect(mockSetHeader).toHaveBeenCalledWith('API-Version', 'v1');
            done();
          },
          error: done,
        });
    });

    it('should use default version if no version is specified', (done) => {
      mockRequest.path = '/api/users';

      interceptor
        .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
        .subscribe({
          next: () => {
            expect(mockSetHeader).toHaveBeenCalledWith('API-Version', DEFAULT_API_VERSION);
            done();
          },
          error: done,
        });
    });

    it('should prioritize URL path version over header version', (done) => {
      mockRequest.path = '/api/v1/users';
      mockRequest.headers['api-version'] = 'v2';

      interceptor
        .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
        .subscribe({
          next: () => {
            expect(mockSetHeader).toHaveBeenCalledWith('API-Version', 'v1');
            done();
          },
          error: done,
        });
    });
  });

  describe('version validation', () => {
    it('should throw BadRequestException for unsupported versions', () => {
      mockRequest.path = '/api/v3/users';

      expect(() => {
        interceptor
          .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
          .subscribe();
      }).toThrow(BadRequestException);
      expect(() => {
        interceptor
          .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
          .subscribe();
      }).toThrow(
        `API version "v3" is not supported. Supported versions: ${SUPPORTED_API_VERSIONS.join(', ')}`,
      );
    });

    it('should add apiVersion to the request object', (done) => {
      interceptor
        .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
        .subscribe({
          next: () => {
            expect(mockRequest.apiVersion).toBe('v2');
            done();
          },
          error: done,
        });
    });
  });

  describe('response headers', () => {
    it('should set API-Version and API-Version-Status headers', (done) => {
      interceptor
        .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
        .subscribe({
          next: () => {
            expect(mockSetHeader).toHaveBeenCalledWith('API-Version', 'v2');
            expect(mockSetHeader).toHaveBeenCalledWith('API-Version-Status', 'active');
            done();
          },
          error: done,
        });
    });

    it('should add deprecation headers for deprecated versions', (done) => {
      mockRequest.path = '/api/v1/users';

      interceptor
        .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
        .subscribe({
          next: () => {
            expect(mockSetHeader).toHaveBeenCalledWith('Deprecation', 'true');
            expect(mockSetHeader).toHaveBeenCalledWith('Sunset', expect.any(String));
            expect(mockSetHeader).toHaveBeenCalledWith(
              'Warning',
              expect.stringContaining('API version v1 is deprecated'),
            );
            expect(mockSetHeader).toHaveBeenCalledWith(
              'X-API-Deprecation-Date',
              expect.any(String),
            );
            done();
          },
          error: done,
        });
    });
  });
});
