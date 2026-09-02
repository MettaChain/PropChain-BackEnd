import { DeprecationWarningInterceptor } from './deprecation-warning.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { DEPRECATED_KEY, API_VERSION_KEY } from './api-version.decorator';
import { ApiVersionEnum } from './api-version.constants';

describe('DeprecationWarningInterceptor', () => {
  let interceptor: DeprecationWarningInterceptor;
  let reflector: Reflector;
  let mockExecutionContext: Partial<ExecutionContext>;
  let mockCallHandler: Partial<CallHandler>;
  let mockRequest: any;
  let mockResponse: any;
  let mockSetHeader: jest.Mock;

  beforeEach(() => {
    reflector = new Reflector();
    interceptor = new DeprecationWarningInterceptor(reflector);
    mockSetHeader = jest.fn();
    mockResponse = { setHeader: mockSetHeader };

    mockRequest = {};

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
        getResponse: jest.fn().mockReturnValue(mockResponse),
      }),
      getHandler: jest.fn(),
    };

    mockCallHandler = {
      handle: jest.fn().mockReturnValue(of({ data: 'test' })),
    };

    jest.spyOn(reflector, 'get').mockImplementation((metadataKey: unknown) => {
      if (metadataKey === API_VERSION_KEY) return ApiVersionEnum.V1;
      return undefined;
    });
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should apply deprecation headers for deprecated API versions', (done) => {
    interceptor
      .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
      .subscribe({
        next: () => {
          expect(mockSetHeader).toHaveBeenCalledWith('Deprecation', 'true');
          expect(mockSetHeader).toHaveBeenCalledWith('Sunset', expect.any(String));
          expect(mockSetHeader).toHaveBeenCalledWith('Warning', expect.stringContaining('299 - "'));
          expect(mockSetHeader).toHaveBeenCalledWith(
            'X-Deprecation-Notice',
            expect.stringContaining('Minimum 90-day deprecation window'),
          );
          expect(mockSetHeader).toHaveBeenCalledWith(
            'X-Migration-Guide',
            'https://docs.propchain.io/migration',
          );
          done();
        },
        error: done,
      });
  });

  it('should add _deprecationInfo to response data for deprecated endpoints', (done) => {
    mockCallHandler.handle = jest.fn().mockReturnValue(of({}));

    interceptor
      .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
      .subscribe({
        next: (result) => {
          expect(result._deprecationInfo).toBeDefined();
          expect(result._deprecationInfo.deprecated).toBe(true);
          expect(result._deprecationInfo.version).toBe(ApiVersionEnum.V1);
          expect(result._deprecationInfo.migrationGuide).toBe(
            'https://docs.propchain.io/migration',
          );
          done();
        },
        error: done,
      });
  });

  it('should apply deprecation headers when endpoint is marked with @Deprecated decorator', (done) => {
    jest.spyOn(reflector, 'get').mockImplementation((metadataKey: unknown) => {
      if (metadataKey === DEPRECATED_KEY) return true;
      return undefined;
    });

    interceptor
      .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
      .subscribe({
        next: () => {
          expect(mockSetHeader).toHaveBeenCalledWith('Deprecation', 'true');
          done();
        },
        error: done,
      });
  });

  it('should not add deprecation headers for active versions', (done) => {
    jest.spyOn(reflector, 'get').mockImplementation((metadataKey: unknown) => {
      if (metadataKey === API_VERSION_KEY) return ApiVersionEnum.V2;
      return undefined;
    });

    interceptor
      .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
      .subscribe({
        next: () => {
          // Should not set deprecation header for active version v2
          expect(mockSetHeader).not.toHaveBeenCalledWith('Deprecation', 'true');
          done();
        },
        error: done,
      });
  });
});
