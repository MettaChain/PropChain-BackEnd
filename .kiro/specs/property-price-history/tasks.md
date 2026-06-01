# Implementation Plan: Property Price History Tracking

## Overview

This implementation plan breaks down the Property Price History Tracking feature into discrete, incremental coding tasks. The feature will be implemented in TypeScript using NestJS, with PostgreSQL as the database. Each task builds on previous steps, ensuring core functionality is validated early through automated tests. The implementation follows a layered architecture with database setup, service layer, API layer, and comprehensive testing.

## Tasks

- [x] 1. Database Setup and Schema Migration
  - [x] 1.1 Create Prisma migration for PriceHistory entity
    - Generate migration file with `prisma migrate dev --name add_price_history`
    - Define PriceHistory model with all required fields (id, propertyId, previousPrice, newPrice, priceChangePercentage, timestamp, userId, userRole, changeReason, ipAddress, userAgent, metadata)
    - Add relations to Property and User models
    - _Requirements: 1.1, 1.2, 1.3, 6.6_

  - [x] 1.2 Add database indexes for performance optimization
    - Create composite index on (property_id, timestamp DESC)
    - Create composite index on (property_id, created_at DESC)
    - Create index on (user_id) for audit trail queries
    - Create index on (timestamp) for time-based queries
    - _Requirements: 7.5, 7.6_

  - [x] 1.3 Update schema.prisma with PriceHistory model definition
    - Add PriceHistory model with all fields and proper types
    - Add relations to Property and User
    - Add all required indexes
    - Ensure cascade delete behavior is correct
    - _Requirements: 1.1, 6.6, 6.7_

- [x] 2. Create DTOs and Validation
  - [x] 2.1 Create GetPriceHistoryDto with validation decorators
    - Define limit, offset, startDate, endDate, sortBy, sortOrder parameters
    - Add class-validator decorators for type validation
    - Set default values (limit: 50, offset: 0, sortOrder: DESC)
    - Validate limit is between 1 and 500
    - _Requirements: 2.2, 2.3, 9.6_

  - [x] 2.2 Create ChartDataDto with validation decorators
    - Define interval (daily, weekly, monthly, yearly), startDate, endDate parameters
    - Add validation for interval enum values
    - Add optional date range validation
    - _Requirements: 4.1, 4.4_

  - [x] 2.3 Create ExportDataDto with validation decorators
    - Define format (csv, json), startDate, endDate parameters
    - Add validation for format enum values
    - _Requirements: 8.1, 8.2_

  - [x] 2.4 Create BulkExportDto with validation decorators
    - Define propertyIds array, format, startDate, endDate
    - Add validation for non-empty propertyIds array
    - Add validation for maximum 100 properties per request
    - _Requirements: 12.1, 12.3_

- [x] 3. Implement PriceHistoryService - Core Methods
  - [x] 3.1 Create PriceHistoryService class with dependency injection
    - Inject PrismaService for database access
    - Inject CacheService for caching operations
    - Inject NotificationService for price change events
    - _Requirements: 1.1, 7.6_

  - [x] 3.2 Implement recordPriceChange method
    - Validate new price is positive decimal (> 0)
    - Validate previous price matches last recorded price or is initial price
    - Calculate percentage change using formula: ((newPrice - previousPrice) / previousPrice) * 100
    - Create PriceHistory record with all audit information
    - Update property's current price atomically
    - Trigger notification event
    - Return created record
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 3.2, 6.1, 6.2, 6.3_

  - [x] 3.3 Implement calculatePercentageChange method
    - Handle edge case: previousPrice is zero or null (return null)
    - Calculate percentage change with formula: ((newPrice - previousPrice) / previousPrice) * 100
    - Round result to 2 decimal places
    - Return null for zero previous price
    - _Requirements: 3.2, 3.3, 3.4, 3.7_

  - [x] 3.4 Implement getPriceHistory method with pagination and filtering
    - Query PriceHistory records by propertyId
    - Apply date range filtering (startDate, endDate)
    - Apply sorting (sortBy: timestamp/price/percentage_change, sortOrder: ASC/DESC)
    - Apply pagination (limit, offset)
    - Return paginated results with total count
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 6.4_

  - [x] 3.5 Implement checkPermission method
    - Grant access if user.role === ADMIN
    - Grant access if user.id === property.ownerId
    - Grant access if property.status === ACTIVE (public property)
    - Deny access otherwise
    - Return boolean permission result
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [-] 4. Implement PriceHistoryService - Data Aggregation and Export
  - [x] 4.1 Implement getChartData method with time interval aggregation
    - Query all price history records in date range
    - Group records by time interval (daily, weekly, monthly, yearly)
    - Calculate min, max, first, last prices for each interval
    - Return aggregated data with metadata (propertyId, address, currentPrice, dateRange)
    - Include dataPoints array with timestamp, price, previousPrice, priceChangePercentage, changeReason
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 4.2 Implement exportData method for CSV and JSON formats
    - Query price history records with date range filtering
    - Include all required fields: timestamp, previousPrice, newPrice, priceChangePercentage, userId, userRole, changeReason, metadata
    - Format data as CSV with headers or JSON array
    - Return Buffer with appropriate MIME type
    - _Requirements: 8.1, 8.2, 8.3, 8.6, 8.7_

  - [x] 4.3 Implement bulkExport method for multiple properties
    - Validate user has permission for all specified properties
    - Return 403 error if permission denied for any property
    - Query price history for all properties
    - Combine results with clear property identifiers
    - Export as single file (CSV or JSON)
    - Complete within 5 seconds for up to 100 properties
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

- [x] 5. Implement PriceHistoryPermissionGuard
  - [x] 5.1 Create PriceHistoryPermissionGuard class implementing CanActivate
    - Extract propertyId from route parameters
    - Extract user from request context
    - Call checkPermission method from PriceHistoryService
    - Return true if permission granted, throw ForbiddenException if denied
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [~] 6. Implement PriceHistoryController - Retrieval Endpoints
  - [x] 6.1 Create PriceHistoryController class
    - Inject PriceHistoryService
    - Add JwtAuthGuard for authentication
    - Add PriceHistoryPermissionGuard for authorization
    - _Requirements: 2.7, 5.1_

  - [x] 6.2 Implement GET /api/properties/{propertyId}/price-history endpoint
    - Accept query parameters: limit, offset, startDate, endDate, sortBy, sortOrder
    - Validate parameters using GetPriceHistoryDto
    - Call getPriceHistory service method
    - Return paginated results with metadata
    - Handle 404 error for non-existent property
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

  - [x] 6.3 Implement GET /api/properties/{propertyId}/price-history/chart endpoint
    - Accept query parameters: interval, startDate, endDate
    - Validate parameters using ChartDataDto
    - Call getChartData service method
    - Return formatted chart data
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

- [x] 7. Implement PriceHistoryController - Export Endpoints
  - [x] 7.1 Implement GET /api/properties/{propertyId}/price-history/export endpoint
    - Accept query parameters: format, startDate, endDate
    - Validate parameters using ExportDataDto
    - Call exportData service method
    - Return downloadable file with appropriate MIME type and headers
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 7.2 Implement POST /api/price-history/bulk-export endpoint
    - Accept request body with propertyIds, format, startDate, endDate
    - Validate request body using BulkExportDto
    - Call bulkExport service method
    - Return downloadable file or 403 error if permission denied
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

- [~] 8. Implement Caching Strategy
  - [x] 8.1 Create cache interceptor for price history endpoints
    - Generate cache keys: `price-history:{propertyId}:{limit}:{offset}:{sortBy}:{sortOrder}`
    - Set TTL to 5 minutes for paginated results
    - Implement cache invalidation on price change
    - _Requirements: 7.6, 7.7_

  - [x] 8.2 Implement cache invalidation logic
    - Invalidate cache when new price history record is created
    - Invalidate cache when property is updated
    - Invalidate cache when user permissions change
    - _Requirements: 7.7_

- [~] 9. Integrate with PropertiesModule and AuthModule
  - [x] 9.1 Create price-history.module.ts
    - Import PrismaModule, AuthModule, CacheModule, NotificationModule
    - Register PriceHistoryService, PriceHistoryController
    - Export PriceHistoryService for use in other modules
    - _Requirements: 1.1, 5.1_

  - [x] 9.2 Update PropertiesService to call recordPriceChange
    - Modify update method to call PriceHistoryService.recordPriceChange before updating price
    - Pass all required audit information (userId, userRole, changeReason, ipAddress, userAgent)
    - Ensure atomic transaction for both operations
    - _Requirements: 1.1, 1.5, 1.6_

  - [x] 9.3 Update app.module.ts to import PriceHistoryModule
    - Add PriceHistoryModule to imports array
    - Ensure module is loaded after PrismaModule and AuthModule
    - _Requirements: 1.1_

- [~] 10. Implement Error Handling and Validation
  - [x] 10.1 Add error handling for edge cases
    - Handle empty price history (return empty array with metadata)
    - Handle zero-change price (record with 0% change percentage)
    - Handle non-existent property (return 404)
    - Handle database unavailability (return 503)
    - Handle invalid query parameters (return 400 with validation details)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [x] 10.2 Implement consistent error response format
    - Return error responses with statusCode, message, error, details fields
    - Include validation details for 400 errors
    - Include descriptive messages for 403 and 404 errors
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

- [x] 11. Checkpoint - Ensure all core functionality is implemented
  - Ensure all service methods are implemented and working
  - Ensure all controller endpoints are accessible
  - Ensure error handling is in place
  - Ask the user if questions arise.

- [~] 12. Write Unit Tests for PriceHistoryService
  - [ ] 12.1 Write unit tests for recordPriceChange method
    - **Property 1: Record Completeness**
    - **Validates: Requirements 1.1, 1.2, 1.3**
    - Test that all fields are recorded exactly as provided
    - Test with valid data
    - Test with optional fields (changeReason, metadata)

  - [ ] 12.2 Write unit tests for calculatePercentageChange method
    - **Property 2: Percentage Calculation Formula**
    - **Validates: Requirements 3.2, 3.3, 3.7**
    - Test formula: ((newPrice - previousPrice) / previousPrice) * 100
    - Test rounding to 2 decimal places
    - Test edge case: previousPrice = 0 (return null)
    - Test edge case: previousPrice = null (return null)

  - [ ] 12.3 Write unit tests for getPriceHistory method
    - **Property 3: Chronological Ordering**
    - **Validates: Requirements 2.1, 6.4**
    - Test records are returned in correct order (ASC/DESC)
    - Test pagination correctness
    - Test date range filtering
    - Test sorting by different fields

  - [ ] 12.4 Write unit tests for checkPermission method
    - **Property 6: Permission Enforcement**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
    - Test admin access (always granted)
    - Test owner access (granted for own property)
    - Test public property access (granted for active properties)
    - Test denied access (regular user, private property)

  - [ ] 12.5 Write unit tests for getChartData method
    - **Property 10: Chart Data Aggregation**
    - **Validates: Requirements 4.4, 4.5**
    - Test aggregation by different intervals (daily, weekly, monthly, yearly)
    - Test min, max, first, last price calculations
    - Test date range filtering

  - [ ] 12.6 Write unit tests for exportData method
    - **Property 11: Export Field Inclusion**
    - **Validates: Requirements 8.3**
    - Test CSV format includes all required fields
    - Test JSON format includes all required fields
    - Test with date range filtering

- [~] 13. Write Unit Tests for PriceHistoryController
  - [ ] 13.1 Write unit tests for GET /price-history endpoint
    - Test successful retrieval with valid parameters
    - Test 401 error without authentication
    - Test 403 error without permission
    - Test 404 error for non-existent property
    - Test 400 error with invalid parameters

  - [ ] 13.2 Write unit tests for GET /price-history/chart endpoint
    - Test successful chart data retrieval
    - Test different aggregation intervals
    - Test date range filtering

  - [ ] 13.3 Write unit tests for GET /price-history/export endpoint
    - Test CSV export
    - Test JSON export
    - Test permission enforcement

  - [ ] 13.4 Write unit tests for POST /bulk-export endpoint
    - Test bulk export with multiple properties
    - Test 403 error if permission denied for any property
    - Test maximum 100 properties limit

- [~] 14. Write Property-Based Tests for Correctness Properties
  - [ ] 14.1 Write property test for Record Completeness
    - **Property 1: Record Completeness**
    - **Validates: Requirements 1.1, 1.2, 1.3**
    - Generate random valid price change data
    - Verify all fields are stored exactly as provided
    - Test with various combinations of optional fields

  - [ ] 14.2 Write property test for Percentage Calculation Formula
    - **Property 2: Percentage Calculation Formula**
    - **Validates: Requirements 3.2, 3.3, 3.7**
    - Generate random previousPrice and newPrice values
    - Verify formula: ((newPrice - previousPrice) / previousPrice) * 100
    - Verify rounding to 2 decimal places
    - Test edge cases: zero, null, negative values

  - [ ] 14.3 Write property test for Chronological Ordering
    - **Property 3: Chronological Ordering**
    - **Validates: Requirements 2.1, 6.4**
    - Generate multiple price history records with different timestamps
    - Verify records are returned in strictly increasing order by timestamp (ASC)
    - Verify records are returned in strictly decreasing order by timestamp (DESC)

  - [ ] 14.4 Write property test for Pagination Correctness
    - **Property 4: Pagination Correctness**
    - **Validates: Requirements 2.2, 2.3**
    - Generate large dataset of price history records
    - Verify returned records are exactly records [offset, offset+limit)
    - Verify total count equals actual total
    - Test various limit and offset combinations

  - [ ] 14.5 Write property test for Date Range Filtering
    - **Property 5: Date Range Filtering**
    - **Validates: Requirements 2.5**
    - Generate records with various timestamps
    - Verify all returned records have timestamp T where startDate ≤ T ≤ endDate
    - Verify no records outside range are returned

  - [ ] 14.6 Write property test for Permission Enforcement
    - **Property 6: Permission Enforcement**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
    - Generate various user roles and property ownership scenarios
    - Verify access is granted if and only if: user.role = ADMIN OR user.id = property.ownerId OR property.status = ACTIVE
    - Test all combinations of conditions

  - [ ] 14.7 Write property test for Price Validation
    - **Property 7: Price Validation**
    - **Validates: Requirements 6.1**
    - Generate invalid price values (negative, zero, non-decimal)
    - Verify system rejects invalid prices with validation error
    - Verify valid prices are accepted

  - [ ] 14.8 Write property test for Previous Price Consistency
    - **Property 8: Previous Price Consistency**
    - **Validates: Requirements 6.2**
    - Generate sequence of price changes
    - Verify previousPrice matches newPrice of preceding record
    - Verify initial record has correct initial price

  - [ ] 14.9 Write property test for Duplicate Prevention
    - **Property 9: Duplicate Prevention**
    - **Validates: Requirements 6.3**
    - Attempt to create two records with identical propertyId and timestamp
    - Verify second record is prevented with conflict error

  - [ ] 14.10 Write property test for Chart Data Aggregation
    - **Property 10: Chart Data Aggregation**
    - **Validates: Requirements 4.4, 4.5**
    - Generate records across multiple time intervals
    - Verify aggregated min, max, first, last prices match underlying records
    - Test all aggregation intervals (daily, weekly, monthly, yearly)

  - [ ] 14.11 Write property test for Export Field Inclusion
    - **Property 11: Export Field Inclusion**
    - **Validates: Requirements 8.3**
    - Generate price history records with all fields
    - Export to CSV and JSON
    - Verify all required fields are present in export

  - [ ] 14.12 Write property test for Bulk Operation Atomicity
    - **Property 12: Bulk Operation Atomicity**
    - **Validates: Requirements 12.4, 12.5**
    - Generate bulk export request with mixed permissions
    - Verify 403 error if user lacks permission for any property
    - Verify no partial export occurs

  - [ ] 14.13 Write property test for Zero-Change Recording
    - **Property 13: Zero-Change Recording**
    - **Validates: Requirements 9.2**
    - Create price change where newPrice = previousPrice
    - Verify record is created with priceChangePercentage = 0.00
    - Verify record is not rejected

  - [ ] 14.14 Write property test for Null Previous Price Handling
    - **Property 14: Null Previous Price Handling**
    - **Validates: Requirements 3.4**
    - Create record with null or zero previousPrice
    - Verify priceChangePercentage is null (not division error)
    - Verify record is created successfully

  - [ ] 14.15 Write property test for Metadata Preservation
    - **Property 15: Metadata Preservation**
    - **Validates: Requirements 11.4, 11.5, 11.7**
    - Create record with custom metadata
    - Retrieve record after property modifications
    - Verify metadata is returned exactly as provided

- [~] 15. Write Integration Tests
  - [ ] 15.1 Write integration test for price change recording flow
    - Create property with initial price
    - Update property price through PropertiesService
    - Verify PriceHistory record is created
    - Verify property price is updated
    - Verify notification event is triggered

  - [ ] 15.2 Write integration test for price history retrieval with permissions
    - Create property owned by user A
    - Create price history records
    - Test retrieval as owner (should succeed)
    - Test retrieval as admin (should succeed)
    - Test retrieval as unauthorized user (should fail)

  - [ ] 15.3 Write integration test for chart data aggregation
    - Create property with multiple price changes over time
    - Request chart data with different intervals
    - Verify aggregation is correct
    - Verify data is formatted for charting libraries

  - [ ] 15.4 Write integration test for export functionality
    - Create property with price history
    - Export as CSV and JSON
    - Verify file format is correct
    - Verify all fields are included

  - [ ] 15.5 Write integration test for bulk export
    - Create multiple properties with price history
    - Request bulk export with mixed permissions
    - Verify 403 error if permission denied
    - Verify successful export if all permissions granted

  - [ ] 15.6 Write integration test for cache invalidation
    - Retrieve price history (should be cached)
    - Create new price history record
    - Verify cache is invalidated
    - Retrieve price history again (should return fresh data)

- [x] 16. Checkpoint - Ensure all tests pass
  - Run all unit tests: `npm run test -- price-history.service.spec.ts`
  - Run all controller tests: `npm run test -- price-history.controller.spec.ts`
  - Run all integration tests: `npm run test -- price-history.integration.spec.ts`
  - Run all property-based tests: `npm run test -- price-history.property.spec.ts`
  - Ensure test coverage is above 80%
  - Ask the user if questions arise.

- [~] 17. Performance Testing and Optimization
  - [ ] 17.1 Write performance test for price history retrieval
    - Create property with 1000+ price history records
    - Measure retrieval time with pagination
    - Verify performance is within 500ms target
    - Verify database indexes are being used

  - [ ] 17.2 Write performance test for chart data aggregation
    - Create property with 5 years of monthly price changes
    - Measure aggregation time for different intervals
    - Verify performance is within 1000ms target

  - [ ] 17.3 Write performance test for bulk export
    - Create 100 properties with price history
    - Measure bulk export time
    - Verify performance is within 5 second target

  - [ ] 17.4 Write performance test for concurrent requests
    - Simulate 100 concurrent price history requests
    - Verify system handles without degradation
    - Verify response times remain acceptable

- [~] 18. Documentation and API Documentation
  - [ ] 18.1 Create API documentation with Swagger/OpenAPI
    - Document GET /api/properties/{propertyId}/price-history endpoint
    - Document GET /api/properties/{propertyId}/price-history/chart endpoint
    - Document GET /api/properties/{propertyId}/price-history/export endpoint
    - Document POST /api/price-history/bulk-export endpoint
    - Include request/response examples
    - Include error response examples

  - [ ] 18.2 Create usage examples in README
    - Example: Retrieve price history with pagination
    - Example: Get chart data for visualization
    - Example: Export price history as CSV
    - Example: Bulk export multiple properties

- [x] 19. Final Checkpoint - Ensure all tests pass and code quality
  - Run full test suite: `npm run test`
  - Run linting: `npm run lint`
  - Run formatting: `npm run format`
  - Verify all tests pass
  - Verify no linting errors
  - Verify code is properly formatted
  - Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property-based tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end flows
- Performance tests ensure system meets scalability requirements
- All monetary values must be stored with minimum 2 decimal places precision
- All timestamps must be stored in UTC with timezone information
- Cache invalidation must be implemented to ensure data consistency
- Permission checks must be enforced on all endpoints
- Error responses must follow consistent format with descriptive messages
