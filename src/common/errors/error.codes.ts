export enum ErrorCode {
  // General Errors
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  CONFLICT = 'CONFLICT',
  UNPROCESSABLE_ENTITY = 'UNPROCESSABLE_ENTITY',

  // Auth Errors
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_USER_NOT_FOUND = 'AUTH_USER_NOT_FOUND',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
  AUTH_ACCOUNT_LOCKED = 'AUTH_ACCOUNT_LOCKED',

  // Domain Specific
  PROPERTY_NOT_FOUND = 'PROPERTY_NOT_FOUND',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',

  // Validation Errors
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT = 'INVALID_FORMAT',
  
  // Authentication Errors
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  
  // Authorization Errors
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  ACCESS_DENIED = 'ACCESS_DENIED',
  
  // Resource Errors
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  
  // Conflict Errors
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
  RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
  
  // Server Errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  
  // Business Logic Errors
  BUSINESS_RULE_VIOLATION = 'BUSINESS_RULE_VIOLATION',
  OPERATION_NOT_ALLOWED = 'OPERATION_NOT_ALLOWED',
  INVALID_STATE = 'INVALID_STATE',
}

export const ErrorMessages: Record<ErrorCode, string> = {
  // General
  [ErrorCode.INTERNAL_SERVER_ERROR]: 'An unexpected error occurred. Please try again later',
  [ErrorCode.VALIDATION_ERROR]: 'The provided data is invalid',
  [ErrorCode.NOT_FOUND]: 'The requested resource was not found',
  [ErrorCode.BAD_REQUEST]: 'The request is invalid',
  [ErrorCode.UNAUTHORIZED]: 'You are not authorized to access this resource',
  [ErrorCode.FORBIDDEN]: 'You do not have permission to perform this action',
  [ErrorCode.CONFLICT]: 'A conflict occurred while processing your request',
  [ErrorCode.UNPROCESSABLE_ENTITY]: 'The request was well-formed but was unable to be followed due to semantic errors',

  // Auth
  [ErrorCode.AUTH_INVALID_CREDENTIALS]: 'Invalid credentials provided',
  [ErrorCode.AUTH_USER_NOT_FOUND]: 'User not found',
  [ErrorCode.AUTH_TOKEN_EXPIRED]: 'Authentication token has expired',
  [ErrorCode.AUTH_TOKEN_INVALID]: 'Invalid authentication token',
  [ErrorCode.AUTH_ACCOUNT_LOCKED]: 'Account is locked',

  // Domain Specific
  [ErrorCode.PROPERTY_NOT_FOUND]: 'Property not found',
  [ErrorCode.TRANSACTION_FAILED]: 'Transaction failed',

  // Validation
  [ErrorCode.INVALID_INPUT]: 'The input data contains invalid values',
  [ErrorCode.MISSING_REQUIRED_FIELD]: 'Required field is missing',
  [ErrorCode.INVALID_FORMAT]: 'The data format is incorrect',
  
  // Authentication
  [ErrorCode.INVALID_CREDENTIALS]: 'The provided credentials are invalid',
  [ErrorCode.TOKEN_EXPIRED]: 'Your session has expired. Please login again',
  [ErrorCode.TOKEN_INVALID]: 'Invalid authentication token',
  [ErrorCode.AUTHENTICATION_REQUIRED]: 'Authentication is required to access this resource',
  
  // Authorization
  [ErrorCode.INSUFFICIENT_PERMISSIONS]: 'You lack the necessary permissions',
  [ErrorCode.ACCESS_DENIED]: 'Access to this resource is denied',
  
  // Resource
  [ErrorCode.RESOURCE_NOT_FOUND]: 'The specified resource does not exist',
  [ErrorCode.USER_NOT_FOUND]: 'User not found',
  
  // Conflict
  [ErrorCode.DUPLICATE_ENTRY]: 'This entry already exists',
  [ErrorCode.RESOURCE_ALREADY_EXISTS]: 'A resource with this identifier already exists',
  
  // Server
  [ErrorCode.DATABASE_ERROR]: 'A database error occurred',
  [ErrorCode.EXTERNAL_SERVICE_ERROR]: 'An external service is currently unavailable',
  
  // Business Logic
  [ErrorCode.BUSINESS_RULE_VIOLATION]: 'This operation violates business rules',
  [ErrorCode.OPERATION_NOT_ALLOWED]: 'This operation is not allowed',
  [ErrorCode.INVALID_STATE]: 'The resource is in an invalid state for this operation',
};