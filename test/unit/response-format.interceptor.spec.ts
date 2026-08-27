import { ResponseFormatInterceptor } from '../../src/common/interceptors/response-format.interceptor';
import { ExecutionContext, CallHandler, HttpException } from '@nestjs/common';
import { of, throwError } from 'rxjs';

describe('ResponseFormatInterceptor', () => {
  let interceptor: ResponseFormatInterceptor;
  let mockExecutionContext: Partial<ExecutionContext>;
  let mockCallHandler: Partial<CallHandler>;
  let mockResponse: any;
  let mockSwitchToHttp: any;

  beforeEach(() => {
    jest.clearAllMocks();
    interceptor = new ResponseFormatInterceptor();
    
    // Setup mocks
    mockResponse = {
      status: jest.fn(),
    };
    mockSwitchToHttp = {
      getResponse: jest.fn().mockReturnValue(mockResponse),
    };
    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue(mockSwitchToHttp),
    };
    mockCallHandler = {
      handle: jest.fn(),
    };
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should wrap a simple success response in the standard format', (done) => {
    // Arrange
    const rawData = { id: 1, name: 'Test Item' };
    mockCallHandler.handle = jest.fn().mockReturnValue(of(rawData));

    // Act
    interceptor.intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler).subscribe({
      next: (formattedResponse) => {
        // Assert
        expect(formattedResponse.success).toBe(true);
        expect(formattedResponse.data).toEqual(rawData);
        expect(formattedResponse.timestamp).toBeDefined();
        // Should not have meta unless it's paginated
        expect(formattedResponse.meta).toBeUndefined();
        done();
      },
      error: done,
    });
  });

  it('should not wrap responses that already have the success field', (done) => {
    // Arrange
    const alreadyFormatted = {
      success: true,
      data: { custom: 'data' },
      customField: 'already-has-success',
    };
    mockCallHandler.handle = jest.fn().mockReturnValue(of(alreadyFormatted));

    // Act
    interceptor.intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler).subscribe({
      next: (response) => {
        // Assert - returns the exact same object without modification
        expect(response).toEqual(alreadyFormatted);
        done();
      },
      error: done,
    });
  });

  it('should handle paginated responses with data and meta', (done) => {
    // Arrange
    const paginatedData = {
      data: [{ id: 1 }, { id: 2 }],
      meta: {
        page: 1,
        limit: 10,
        total: 25,
        totalPages: 3,
      },
    };
    mockCallHandler.handle = jest.fn().mockReturnValue(of(paginatedData));

    // Act
    interceptor.intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler).subscribe({
      next: (formattedResponse) => {
        // Assert
        expect(formattedResponse.success).toBe(true);
        expect(formattedResponse.data).toEqual(paginatedData.data);
        expect(formattedResponse.meta).toEqual(paginatedData.meta);
        expect(formattedResponse.timestamp).toBeDefined();
        done();
      },
      error: done,
    });
  });

  it('should validate and fill in missing pagination meta fields', (done) => {
    // Arrange - incomplete pagination meta
    const incompletePaginatedData = {
      data: [{ id: 1 }],
      meta: {
        total: 15, // Only provide total, let it fill in the rest
      },
    };
    mockCallHandler.handle = jest.fn().mockReturnValue(of(incompletePaginatedData));

    // Act
    interceptor.intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler).subscribe({
      next: (formattedResponse) => {
        // Assert
        expect(formattedResponse.meta).toEqual({
          page: 1, // Default
          limit: 10, // Default
          total: 15, // Provided
          totalPages: 2, // Calculated from 15 / 10
        });
        done();
      },
      error: done,
    });
  });

  it('should handle regular (non-pagination) meta data by passing it through', (done) => {
    // Arrange - regular meta, not pagination
    const dataWithMeta = {
      data: { result: 'success' },
      meta: {
        processedAt: '2024-01-01T00:00:00Z',
        source: 'api-v2',
        version: 1.0,
      },
    };
    mockCallHandler.handle = jest.fn().mockReturnValue(of(dataWithMeta));

    // Act
    interceptor.intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler).subscribe({
      next: (formattedResponse) => {
        // Assert - meta is preserved exactly as provided
        expect(formattedResponse.success).toBe(true);
        expect(formattedResponse.meta).toEqual(dataWithMeta.meta);
        done();
      },
      error: done,
    });
  });

  it('should format HttpException errors correctly', (done) => {
    // Arrange
    const httpError = new HttpException('Not found', 404);
    mockCallHandler.handle = jest.fn().mockReturnValue(throwError(() => httpError));

    // Act
    interceptor.intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler).subscribe({
      next: () => done.fail('Should have thrown an error'),
      error: (formattedError) => {
        // Assert
        expect(formattedError.success).toBe(false);
        expect(formattedError.message).toBe('Not found');
        expect(formattedError.statusCode).toBe(404);
        expect(formattedError.timestamp).toBeDefined();
        expect(mockResponse.status).toHaveBeenCalledWith(404);
        done();
      },
    });
  });

  it('should extract errors field from HttpException response if present', (done) => {
    // Arrange - validation error with errors array
    const validationError = new HttpException({
      message: 'Validation failed',
      errors: [
        { field: 'email', message: 'Invalid email format' },
        { field: 'password', message: 'Too short' },
      ],
    }, 400);
    mockCallHandler.handle = jest.fn().mockReturnValue(throwError(() => validationError));

    // Act
    interceptor.intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler).subscribe({
      next: () => done.fail('Should have thrown an error'),
      error: (formattedError) => {
        // Assert
        expect(formattedError.success).toBe(false);
        expect(formattedError.message).toBe('Validation failed');
        expect(formattedError.errors).toEqual(validationError.getResponse().errors);
        expect(formattedError.statusCode).toBe(400);
        done();
      },
    });
  });

  it('should handle generic Error objects (non-HttpException)', (done) => {
    // Arrange
    const genericError = new Error('Something went wrong in the database');
    mockCallHandler.handle = jest.fn().mockReturnValue(throwError(() => genericError));

    // Act
    interceptor.intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler).subscribe({
      next: () => done.fail('Should have thrown an error'),
      error: (formattedError) => {
        // Assert - defaults to 500
        expect(formattedError.success).toBe(false);
        expect(formattedError.message).toBe('Something went wrong in the database');
        expect(formattedError.statusCode).toBe(500);
        expect(mockResponse.status).toHaveBeenCalledWith(500);
        done();
      },
    });
  });

  it('should use default error message for unknown error types', (done) => {
    // Arrange - throw a string error, not an Error object
    mockCallHandler.handle = jest.fn().mockReturnValue(throwError(() => 'string error message'));

    // Act
    interceptor.intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler).subscribe({
      next: () => done.fail('Should have thrown an error'),
      error: (formattedError) => {
        // Assert
        expect(formattedError.success).toBe(false);
        expect(formattedError.message).toBe('Internal Server Error');
        expect(formattedError.statusCode).toBe(500);
        done();
      },
    });
  });
});