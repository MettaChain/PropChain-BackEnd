import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorMessages } from './error.codes';

export class BaseCustomException extends HttpException {
  constructor(
    public readonly errorCode: ErrorCode,
    message?: string,
    public readonly details?: string[],
    statusCode?: HttpStatus,
  ) {
    super(
      {
        errorCode,
        message: message || ErrorMessages[errorCode],
        details,
      },
      statusCode || HttpStatus.BAD_REQUEST,
    );
  }
}

// Validation Exceptions
export class ValidationException extends BaseCustomException {
  constructor(details?: string[], message?: string) {
    super(
      ErrorCode.VALIDATION_ERROR,
      message,
      details,
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class InvalidInputException extends BaseCustomException {
  constructor(details?: string[], message?: string) {
    super(
      ErrorCode.INVALID_INPUT,
      message,
      details,
      HttpStatus.BAD_REQUEST,
    );
  }
}

// Authentication Exceptions
export class UnauthorizedException extends BaseCustomException {
  constructor(message?: string, details?: string[]) {
    super(
      ErrorCode.UNAUTHORIZED,
      message,
      details,
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class InvalidCredentialsException extends BaseCustomException {
  constructor(message?: string) {
    super(
      ErrorCode.INVALID_CREDENTIALS,
      message,
      undefined,
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class TokenExpiredException extends BaseCustomException {
  constructor(message?: string) {
    super(
      ErrorCode.TOKEN_EXPIRED,
      message,
      undefined,
      HttpStatus.UNAUTHORIZED,
    );
  }
}

// Authorization Exceptions
export class ForbiddenException extends BaseCustomException {
  constructor(message?: string, details?: string[]) {
    super(
      ErrorCode.FORBIDDEN,
      message,
      details,
      HttpStatus.FORBIDDEN,
    );
  }
}

export class InsufficientPermissionsException extends BaseCustomException {
  constructor(message?: string) {
    super(
      ErrorCode.INSUFFICIENT_PERMISSIONS,
      message,
      undefined,
      HttpStatus.FORBIDDEN,
    );
  }
}

// Resource Exceptions
export class ResourceNotFoundException extends BaseCustomException {
  constructor(resourceType?: string, message?: string) {
    const customMessage = message || 
      (resourceType ? `${resourceType} not found` : undefined);
    super(
      ErrorCode.RESOURCE_NOT_FOUND,
      customMessage,
      undefined,
      HttpStatus.NOT_FOUND,
    );
  }
}

export class UserNotFoundException extends BaseCustomException {
  constructor(userId?: string) {
    const message = userId 
      ? `User with ID ${userId} not found`
      : undefined;
    super(
      ErrorCode.USER_NOT_FOUND,
      message,
      undefined,
      HttpStatus.NOT_FOUND,
    );
  }
}

export class PropertyNotFoundException extends BaseCustomException {
  constructor(propertyId?: string) {
    const message = propertyId
      ? `Property with ID ${propertyId} not found`
      : undefined;
    super(
      ErrorCode.PROPERTY_NOT_FOUND,
      message,
      undefined,
      HttpStatus.NOT_FOUND,
    );
  }
}

// Conflict Exceptions
export class ConflictException extends BaseCustomException {
  constructor(message?: string, details?: string[]) {
    super(
      ErrorCode.CONFLICT,
      message,
      details,
      HttpStatus.CONFLICT,
    );
  }
}

export class DuplicateEntryException extends BaseCustomException {
  constructor(field?: string, message?: string) {
    const customMessage = message || 
      (field ? `${field} already exists` : undefined);
    super(
      ErrorCode.DUPLICATE_ENTRY,
      customMessage,
      undefined,
      HttpStatus.CONFLICT,
    );
  }
}

// Server Exceptions
export class InternalServerException extends BaseCustomException {
  constructor(message?: string, details?: string[]) {
    super(
      ErrorCode.INTERNAL_SERVER_ERROR,
      message,
      details,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export class DatabaseException extends BaseCustomException {
  constructor(message?: string) {
    super(
      ErrorCode.DATABASE_ERROR,
      message,
      undefined,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

// Business Logic Exceptions
export class BusinessRuleViolationException extends BaseCustomException {
  constructor(message?: string, details?: string[]) {
    super(
      ErrorCode.BUSINESS_RULE_VIOLATION,
      message,
      details,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class OperationNotAllowedException extends BaseCustomException {
  constructor(message?: string) {
    super(
      ErrorCode.OPERATION_NOT_ALLOWED,
      message,
      undefined,
      HttpStatus.FORBIDDEN,
    );
  }
}