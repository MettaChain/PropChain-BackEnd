// Service response interfaces
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp: Date;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface ApiResponse<T> {
  statusCode: number;
  message: string;
  data: T;
  timestamp: string;
}

// Generic service interfaces
export interface CreateServiceOptions {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface UpdateServiceOptions {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface DeleteServiceOptions {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SearchServiceOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  includeDeleted?: boolean;
}

// Validation service types
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: any;
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
  value?: any;
}

// Cache service types
export interface CacheOptions {
  ttl?: number;
  tags?: string[];
  refresh?: boolean;
}

export interface CacheEntry<T> {
  key: string;
  value: T;
  expiry: Date;
  tags: string[];
}

// Audit service types
export interface AuditLogEntry {
  id: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  before?: any;
  after?: any;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

// File service types
export interface FileUploadOptions {
  allowedTypes?: string[];
  maxSize?: number;
  destination?: string;
}

export interface FileMetadata {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  checksum: string;
  uploadedAt: Date;
}

// Notification service types
export interface NotificationOptions {
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  channels?: ('email' | 'sms' | 'push' | 'webhook')[];
  scheduledFor?: Date;
  retryCount?: number;
}

export interface NotificationMessage {
  to: string | string[];
  subject: string;
  body: string;
  template?: string;
  data?: Record<string, any>;
}
