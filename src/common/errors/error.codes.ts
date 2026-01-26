export enum ErrorCode {
  // Validation Errors (4000-4099)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT = 'INVALID_FORMAT',
  
  // Authentication Errors (4100-4199)
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  
  // Authorization Errors (4300-4399)
  FORBIDDEN = 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  ACCESS_DENIED = 'ACCESS_DENIED',
  
  // Resource Errors (4400-4499)
  NOT_FOUND = 'NOT_FOUND',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  PROPERTY_NOT_FOUND = 'PROPERTY_NOT_FOUND',
  
  // Conflict Errors (4090-4099)
  CONFLICT = 'CONFLICT',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
  RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
  
  // Server Errors (5000-5099)
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  
  // Business Logic Errors (5100-5199)
  BUSINESS_RULE_VIOLATION = 'BUSINESS_RULE_VIOLATION',
  OPERATION_NOT_ALLOWED = 'OPERATION_NOT_ALLOWED',
  INVALID_STATE = 'INVALID_STATE',
}

export const ErrorMessages: Record<ErrorCode, string> = {
  // Validation
  [ErrorCode.VALIDATION_ERROR]: 'The provided data is invalid',
  [ErrorCode.INVALID_INPUT]: 'The input data contains invalid values',
  [ErrorCode.MISSING_REQUIRED_FIELD]: 'Required field is missing',
  [ErrorCode.INVALID_FORMAT]: 'The data format is incorrect',
  
  // Authentication
  [ErrorCode.UNAUTHORIZED]: 'You are not authorized to access this resource',
  [ErrorCode.INVALID_CREDENTIALS]: 'The provided credentials are invalid',
  [ErrorCode.TOKEN_EXPIRED]: 'Your session has expired. Please login again',
  [ErrorCode.TOKEN_INVALID]: 'Invalid authentication token',
  [ErrorCode.AUTHENTICATION_REQUIRED]: 'Authentication is required to access this resource',
  
  // Authorization
  [ErrorCode.FORBIDDEN]: 'You do not have permission to perform this action',
  [ErrorCode.INSUFFICIENT_PERMISSIONS]: 'You lack the necessary permissions',
  [ErrorCode.ACCESS_DENIED]: 'Access to this resource is denied',
  
  // Resource
  [ErrorCode.NOT_FOUND]: 'The requested resource was not found',
  [ErrorCode.RESOURCE_NOT_FOUND]: 'The specified resource does not exist',
  [ErrorCode.USER_NOT_FOUND]: 'User not found',
  [ErrorCode.PROPERTY_NOT_FOUND]: 'Property not found',
  
  // Conflict
  [ErrorCode.CONFLICT]: 'A conflict occurred while processing your request',
  [ErrorCode.DUPLICATE_ENTRY]: 'This entry already exists',
  [ErrorCode.RESOURCE_ALREADY_EXISTS]: 'A resource with this identifier already exists',
  
  // Server
  [ErrorCode.INTERNAL_SERVER_ERROR]: 'An unexpected error occurred. Please try again later',
  [ErrorCode.DATABASE_ERROR]: 'A database error occurred',
  [ErrorCode.EXTERNAL_SERVICE_ERROR]: 'An external service is currently unavailable',
  
  // Business Logic
  [ErrorCode.BUSINESS_RULE_VIOLATION]: 'This operation violates business rules',
  [ErrorCode.OPERATION_NOT_ALLOWED]: 'This operation is not allowed',
  [ErrorCode.INVALID_STATE]: 'The resource is in an invalid state for this operation',
};