import { Test, TestingModule } from '@nestjs/testing';
import { AllExceptionsFilter } from './error.filter';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../logger/logger.service';
import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';
import { ErrorCode } from './error.codes';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let loggerService: LoggerService;

  const mockResponse = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };

  const mockRequest = {
    url: '/test',
    method: 'GET',
    ip: '127.0.0.1',
    headers: {},
    connection: { remoteAddress: '127.0.0.1' },
  };

  const mockArgumentsHost = {
    switchToHttp: jest.fn().mockReturnThis(),
    getResponse: jest.fn().mockReturnValue(mockResponse),
    getRequest: jest.fn().mockReturnValue(mockRequest),
  } as unknown as ArgumentsHost;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AllExceptionsFilter,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('development') },
        },
        {
          provide: LoggerService,
          useValue: { 
            logError: jest.fn(),
            error: jest.fn(),
            logSecurityEvent: jest.fn() 
          },
        },
      ],
    }).compile();

    filter = module.get<AllExceptionsFilter>(AllExceptionsFilter);
    loggerService = module.get<LoggerService>(LoggerService);
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should format HttpException correctly', () => {
    const status = HttpStatus.BAD_REQUEST;
    const message = 'Bad Request';
    const exception = new HttpException(message, status);

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(status);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: status,
        errorCode: ErrorCode.VALIDATION_ERROR, // Matches your mapStatusToErrorCode logic
      }),
    );
  });

  it('should format validation errors (array message) correctly', () => {
    const status = HttpStatus.BAD_REQUEST;
    const validationErrors = ['email must be an email'];
    const exception = new HttpException({ message: validationErrors }, status);

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(status);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: ErrorCode.VALIDATION_ERROR,
        details: validationErrors,
      }),
    );
  });

  it('should format unknown exceptions as internal server error', () => {
    const exception = new Error('Unknown error');

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    // Check if either logError or error was called
    const wasLogged = 
      (loggerService.logError as jest.Mock).mock.calls.length > 0 || 
      (loggerService.error as jest.Mock).mock.calls.length > 0;
    
    expect(wasLogged).toBe(true);
  });
});