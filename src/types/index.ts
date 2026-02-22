/**
 * Type Definitions Index
 * 
 * This module exports all type definitions used throughout the PropChain backend.
 * It provides a centralized location for importing types across the application.
 * 
 * @module types
 * @since 1.0.0
 */

/**
 * Export all Prisma-related type definitions
 * Includes model interfaces, query result types, and Prisma utility types
 */
export * from './prisma.types';

/**
 * Export all service-related type definitions
 * Includes response interfaces, pagination types, and service operation types
 */
export * from './service.types';

/**
 * Export all validation-related type definitions
 * Includes validation rules, schemas, and constraint definitions
 */
export * from './validation.types';

/**
 * Export all security-related type definitions
 * Includes authentication types, MFA interfaces, and security event types
 */
export * from './security.types';

/**
 * Export all API-related type definitions
 * Includes HTTP request/response types, API documentation types, and gateway configurations
 */
export * from './api.types';

/**
 * Export all type guard utilities
 * Includes runtime type checking functions and assertion utilities
 */
export * from './guards';