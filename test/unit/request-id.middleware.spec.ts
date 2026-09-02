import {
  RequestIdMiddleware,
  REQUEST_ID_HEADER,
  getCurrentRequestId,
} from '../../src/common/request-id.middleware';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

// Mock the uuid module
jest.mock('uuid', () => ({
  v4: jest.fn(),
}));

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    middleware = new RequestIdMiddleware();
    mockNext = jest.fn();
    mockResponse = {
      setHeader: jest.fn(),
    };
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  it('should generate a new request ID if none is provided in the request headers', (done) => {
    // Arrange
    const testUuid = 'generated-uuid-123';
    (uuidv4 as jest.Mock).mockReturnValue(testUuid);
    mockRequest = {
      headers: {},
    };

    // Act
    middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

    // Assert - wait for the next function to be called (async local storage runs it)
    process.nextTick(() => {
      expect(uuidv4).toHaveBeenCalledTimes(1);
      expect(mockResponse.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, testUuid);
      expect(mockNext).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('should use the existing request ID from the request headers if provided', (done) => {
    // Arrange
    const existingRequestId = 'existing-client-request-id-456';
    mockRequest = {
      headers: {
        [REQUEST_ID_HEADER.toLowerCase()]: existingRequestId,
      },
    };

    // Act
    middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

    // Assert
    process.nextTick(() => {
      expect(uuidv4).not.toHaveBeenCalled();
      expect(mockResponse.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, existingRequestId);
      expect(mockNext).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('should store the request ID in AsyncLocalStorage and make it accessible via getCurrentRequestId', (done) => {
    // Arrange
    const testRequestId = 'test-storage-id-789';
    (uuidv4 as jest.Mock).mockReturnValue(testRequestId);
    mockRequest = {
      headers: {},
    };

    // Act
    let capturedRequestId: string | undefined;
    middleware.use(mockRequest as Request, mockResponse as Response, () => {
      // Access the request ID from within the async context
      capturedRequestId = getCurrentRequestId();
      mockNext();
    });

    // Assert
    process.nextTick(() => {
      expect(capturedRequestId).toBe(testRequestId);
      expect(mockNext).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('should maintain separate request IDs for concurrent requests', (done) => {
    // Arrange
    const firstRequestId = 'first-request-id';
    const secondRequestId = 'second-request-id';
    (uuidv4 as jest.Mock).mockReturnValueOnce(firstRequestId).mockReturnValueOnce(secondRequestId);

    const firstRequest = { headers: {} } as Request;
    const secondRequest = { headers: {} } as Request;
    const firstResponse = { setHeader: jest.fn() } as Response;
    const secondResponse = { setHeader: jest.fn() } as Response;

    let firstCapturedId: string | undefined;
    let secondCapturedId: string | undefined;

    // Act - start first request
    middleware.use(firstRequest, firstResponse, () => {
      firstCapturedId = getCurrentRequestId();

      // Start second request while first is still in context
      middleware.use(secondRequest, secondResponse, () => {
        secondCapturedId = getCurrentRequestId();
        mockNext();
      });

      mockNext();
    });

    // Assert
    process.nextTick(() => {
      expect(firstCapturedId).toBe(firstRequestId);
      expect(secondCapturedId).toBe(secondRequestId);
      expect(mockNext).toHaveBeenCalledTimes(2);
      done();
    });
  });

  it('should return undefined from getCurrentRequestId when outside of any request context', () => {
    // Access request ID outside of any middleware context
    const requestId = getCurrentRequestId();
    expect(requestId).toBeUndefined();
  });
});
