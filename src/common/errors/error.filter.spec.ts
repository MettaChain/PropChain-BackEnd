import { Test, TestingModule } from '@nestjs/testing';
import { AppExceptionFilter } from '../../../src/common/errors/error.filter';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../../src/common/logger/logger.service';
import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';
import { ErrorCode } from '../../../src/common/errors/error.codes';

describe('AppExceptionFilter', () => {
  let filter: AppExceptionFilter;
  let configService: ConfigService;
  let loggerService: LoggerService;

  const mockResponse = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };

  const mockRequest = {
    url: '/test',
    method: 'GET',
    ip: '127.0.0.1',
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
        AppExceptionFilter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('development'),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            logError: jest.fn(),
            logSecurityEvent: jest.fn(),
          },
        },
      ],
    }).compile();

    filter = module.get<AppExceptionFilter>(AppExceptionFilter);
    configService = module.get<ConfigService>(ConfigService);
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
        message: message,
        code: ErrorCode.BAD_REQUEST,
        path: mockRequest.url,
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
        statusCode: status,
        message: 'Validation failed',
        code: ErrorCode.VALIDATION_ERROR,
        details: validationErrors,
      }),
    );
  });

  it('should format unknown exceptions as internal server error', () => {
    const exception = new Error('Unknown error');

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        code: ErrorCode.INTERNAL_SERVER_ERROR,
      }),
    );
    expect(loggerService.logError).toHaveBeenCalled();
  });
});
