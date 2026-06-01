# Property Price History Tracking - Design Document

## Overview

The Property Price History Tracking feature provides comprehensive tracking and visualization of property price changes over time. This system records all price modifications with complete audit information, provides historical data retrieval through RESTful API endpoints, calculates price change metrics, and formats data for visualization in charts and analytics dashboards.

### Key Objectives

- Record all price changes with complete audit trail (who, when, why)
- Provide efficient retrieval of historical price data with filtering and pagination
- Calculate price change percentages and trends
- Format data for chart visualization and analytics
- Enforce permission-based access control
- Maintain data integrity and consistency
- Support performance at scale (1000+ records per property)
- Enable data export in multiple formats
- Provide real-time notifications for price changes
- Support bulk operations for multiple properties

## Architecture

### High-Level System Design

The system follows a layered architecture with clear separation of concerns:

- **API Layer**: NestJS controllers handling HTTP requests
- **Service Layer**: Business logic and data transformation
- **Data Access Layer**: Prisma ORM for database operations
- **Database Layer**: PostgreSQL with optimized indexes

### Data Flow

**Price Change Recording:**
1. Property price update request arrives at PropertiesController
2. PropertiesService.update() is called
3. Before updating property price, PriceHistoryService.recordPriceChange() is invoked
4. PriceHistoryService validates the change and creates PriceHistory record
5. Transaction ensures both property and history are updated atomically
6. Notification event is triggered for subscribers
7. Response is returned to client

**Price History Retrieval:**
1. GET request arrives at PriceHistoryController
2. Permission check is performed (owner, admin, or public property)
3. Query parameters are validated (pagination, filters, sorting)
4. Database query is executed with appropriate indexes
5. Results are cached if applicable
6. Response is formatted and returned

### Integration Points

- **PropertiesModule**: Integrates with existing property management
- **AuthModule**: Uses JWT authentication and role-based authorization
- **NotificationModule**: Triggers price change notifications
- **CacheModule**: Implements Redis caching for performance
- **ActivityLogModule**: Logs all price history access for audit

## Data Models

### Prisma Schema - PriceHistory Entity

The PriceHistory model tracks all price changes with complete audit information:

```prisma
model PriceHistory {
  id                    String    @id @default(uuid())
  propertyId            String    @map("property_id")
  previousPrice         Decimal   @map("previous_price")
  newPrice              Decimal   @map("new_price")
  priceChangePercentage Decimal?  @map("price_change_percentage")
  timestamp             DateTime  @default(now())
  userId                String    @map("user_id")
  userRole              UserRole  @map("user_role")
  changeReason          String?   @map("change_reason") @db.VarChar(500)
  ipAddress             String?   @map("ip_address")
  userAgent             String?   @map("user_agent")
  metadata              Json?     @default("{}")
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")

  // Relations
  property Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  user     User     @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([propertyId, timestamp])
  @@index([propertyId, createdAt])
  @@index([userId])
  @@index([timestamp])
  @@map("price_history")
}
```

### Database Indexes

**Primary Indexes:**
- `(property_id, timestamp DESC)` - For retrieving price history for a property
- `(property_id, created_at DESC)` - For chronological ordering
- `(user_id)` - For audit trail by user
- `(timestamp)` - For time-based queries

**Performance Indexes:**
- `(property_id, timestamp DESC) INCLUDE (previous_price, new_price, price_change_percentage)` - Covering index for common queries

### Relationships

**PriceHistory  Property**
- Many-to-One relationship
- Foreign key: propertyId
- Cascade delete: When property is deleted, history is preserved

**PriceHistory  User**
- Many-to-One relationship
- Foreign key: userId
- Set null on delete: Preserves history even if user is deleted

## API Design

### Endpoint 1: Get Price History

**Endpoint:** `GET /api/properties/{propertyId}/price-history`

**Authentication:** Required (JWT)

**Authorization:** Property owner, admin, or public property

**Query Parameters:**
- `limit`: number (default: 50, max: 500)
- `offset`: number (default: 0)
- `startDate`: ISO 8601 timestamp (optional)
- `endDate`: ISO 8601 timestamp (optional)
- `sortBy`: 'timestamp' | 'price' | 'percentage_change' (default: 'timestamp')
- `sortOrder`: 'ASC' | 'DESC' (default: 'DESC')

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "uuid",
      "propertyId": "uuid",
      "previousPrice": 250000.00,
      "newPrice": 255000.00,
      "priceChangePercentage": 2.00,
      "timestamp": "2024-01-15T10:30:00Z",
      "userId": "uuid",
      "userRole": "AGENT",
      "changeReason": "Market adjustment",
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "metadata": {
        "source": "web",
        "reason_category": "market_adjustment"
      }
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

**Error Responses:**
- 401 Unauthorized: Missing or invalid authentication
- 403 Forbidden: User lacks permission to view property
- 404 Not Found: Property does not exist
- 400 Bad Request: Invalid query parameters

### Endpoint 2: Get Chart Data

**Endpoint:** `GET /api/properties/{propertyId}/price-history/chart`

**Query Parameters:**
- `interval`: 'daily' | 'weekly' | 'monthly' | 'yearly' (default: 'daily')
- `startDate`: ISO 8601 timestamp (optional)
- `endDate`: ISO 8601 timestamp (optional)

**Response (200 OK):**
```json
{
  "propertyId": "uuid",
  "propertyAddress": "123 Main St, Springfield, IL 62701",
  "currentPrice": 255000.00,
  "dateRange": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-12-31T23:59:59Z"
  },
  "aggregationInterval": "monthly",
  "dataPoints": [
    {
      "timestamp": "2024-01-31T23:59:59Z",
      "price": 250000.00,
      "previousPrice": 250000.00,
      "priceChangePercentage": 0.00,
      "changeReason": "Initial listing"
    }
  ]
}
```

### Endpoint 3: Export Price History

**Endpoint:** `GET /api/properties/{propertyId}/price-history/export`

**Query Parameters:**
- `format`: 'csv' | 'json' (default: 'json')
- `startDate`: ISO 8601 timestamp (optional)
- `endDate`: ISO 8601 timestamp (optional)

**Response:** Downloadable file with appropriate MIME type

### Endpoint 4: Bulk Export

**Endpoint:** `POST /api/price-history/bulk-export`

**Request Body:**
```json
{
  "propertyIds": ["uuid1", "uuid2", "uuid3"],
  "format": "csv",
  "startDate": "2024-01-01T00:00:00Z",
  "endDate": "2024-12-31T23:59:59Z"
}
```

**Response:** Downloadable file containing price history for all specified properties

## Service Layer

### PriceHistoryService

**Key Methods:**

```typescript
// Record a price change
async recordPriceChange(
  propertyId: string,
  previousPrice: Decimal,
  newPrice: Decimal,
  userId: string,
  userRole: UserRole,
  changeReason?: string,
  metadata?: Record<string, any>,
  ipAddress?: string,
  userAgent?: string
): Promise<PriceHistory>

// Retrieve price history with pagination
async getPriceHistory(
  propertyId: string,
  limit: number,
  offset: number,
  startDate?: Date,
  endDate?: Date,
  sortBy?: string,
  sortOrder?: 'ASC' | 'DESC'
): Promise<{ data: PriceHistory[]; total: number }>

// Calculate percentage change
calculatePercentageChange(previousPrice: Decimal, newPrice: Decimal): Decimal | null

// Get chart data with aggregation
async getChartData(
  propertyId: string,
  interval: 'daily' | 'weekly' | 'monthly' | 'yearly',
  startDate?: Date,
  endDate?: Date
): Promise<ChartDataResponse>

// Export data in specified format
async exportData(
  propertyId: string,
  format: 'csv' | 'json',
  startDate?: Date,
  endDate?: Date
): Promise<Buffer>

// Check user permissions
async checkPermission(
  userId: string,
  userRole: UserRole,
  propertyId: string
): Promise<boolean>

// Bulk export for multiple properties
async bulkExport(
  propertyIds: string[],
  userId: string,
  userRole: UserRole,
  format: 'csv' | 'json',
  startDate?: Date,
  endDate?: Date
): Promise<Buffer>
```

### Business Logic

**Price Change Recording:**
1. Validate new price is positive decimal
2. Verify previous price matches last recorded price
3. Calculate percentage change
4. Create PriceHistory record with audit information
5. Update property's current price
6. Trigger notification event
7. Return created record

**Permission Checking:**
1. If user is ADMIN, grant access
2. If user is property owner, grant access
3. If property is publicly listed, grant access to any user
4. Otherwise, deny access

**Data Aggregation:**
1. Query all price history records in date range
2. Group by time interval (daily, weekly, monthly, yearly)
3. Calculate min, max, first, last prices for each interval
4. Return aggregated data with metadata

## Implementation Details

### NestJS Module Structure

```
src/price-history/
 price-history.module.ts
 price-history.controller.ts
 price-history.service.ts
 dto/
   get-price-history.dto.ts
   chart-data.dto.ts
   export-data.dto.ts
   bulk-export.dto.ts
 entities/
   price-history.entity.ts
 guards/
   price-history-permission.guard.ts
 interceptors/
    price-history-cache.interceptor.ts
```

### Controllers and DTOs

**PriceHistoryController:**

The controller handles all HTTP requests for price history operations with proper authentication and authorization guards.

**DTOs:**

- `GetPriceHistoryDto`: Validates pagination and filtering parameters
- `ChartDataDto`: Validates chart data request parameters
- `ExportDataDto`: Validates export format and date range
- `BulkExportDto`: Validates bulk export requests

### Permission Guard

The `PriceHistoryPermissionGuard` enforces access control:
- Admins can access any property's price history
- Property owners can access their own property's price history
- Regular users can only access publicly listed properties

### Caching Strategy

**Cache Keys:**
- `price-history:{propertyId}:{limit}:{offset}:{sortBy}:{sortOrder}` - For paginated results
- `price-history-chart:{propertyId}:{interval}:{startDate}:{endDate}` - For chart data
- `price-history-count:{propertyId}` - For total count

**TTL:** 5 minutes for price history, 15 minutes for chart data

**Invalidation:** Cache is invalidated when:
- New price history record is created
- Property is updated
- User permissions change

## Performance Considerations

### Database Indexing Strategy

**Composite Indexes:**
```sql
CREATE INDEX idx_price_history_property_timestamp 
ON price_history(property_id, timestamp DESC);

CREATE INDEX idx_price_history_property_created 
ON price_history(property_id, created_at DESC);

CREATE INDEX idx_price_history_user 
ON price_history(user_id);

CREATE INDEX idx_price_history_timestamp 
ON price_history(timestamp);
```

**Covering Indexes:**
```sql
CREATE INDEX idx_price_history_covering 
ON price_history(property_id, timestamp DESC) 
INCLUDE (previous_price, new_price, price_change_percentage);
```

### Query Optimization

**Pagination:**
- Use LIMIT and OFFSET with indexes
- Avoid large offsets (use keyset pagination for large datasets)
- Return total count in separate query for better performance

**Aggregation:**
- Pre-calculate aggregations for common intervals
- Use database-level aggregation functions
- Cache aggregated results

**Filtering:**
- Use indexed columns for WHERE clauses
- Combine filters efficiently
- Use prepared statements to prevent SQL injection

## Error Handling

### Error Response Format

```json
{
  "statusCode": 400,
  "message": "Invalid query parameters",
  "error": "Bad Request",
  "details": {
    "limit": "limit must be a number between 1 and 500"
  }
}
```

### Common Errors

- **400 Bad Request**: Invalid parameters, validation errors
- **401 Unauthorized**: Missing or invalid authentication
- **403 Forbidden**: User lacks permission
- **404 Not Found**: Property or resource not found
- **500 Internal Server Error**: Unexpected server error
- **503 Service Unavailable**: Database or service unavailable

## Testing Strategy

### Unit Tests

**PriceHistoryService Tests:**
- Test price change recording with valid data
- Test percentage calculation with various price points
- Test edge cases (zero previous price, same price)
- Test permission checking logic
- Test data aggregation for different intervals
- Test export formatting (CSV, JSON)

**Controller Tests:**
- Test endpoint authorization
- Test query parameter validation
- Test response formatting
- Test error handling

### Integration Tests

- Test price history recording with database
- Test retrieval with pagination
- Test permission enforcement
- Test cache invalidation
- Test concurrent requests
- Test bulk operations

### Performance Tests

- Test retrieval performance with 1000+ records (target: <500ms)
- Test chart aggregation performance (target: <1000ms)
- Test concurrent request handling
- Test bulk export performance (target: <5s for 100 properties)
- Test cache effectiveness

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a systemessentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Record Completeness
*For any* valid price change with propertyId P, previousPrice PP, newPrice NP, userId U, and userRole R, the created PriceHistory record SHALL contain all these values exactly as provided.

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Percentage Calculation Formula
*For any* previousPrice PP > 0 and newPrice NP, the calculated priceChangePercentage SHALL equal ((NP - PP) / PP) * 100, rounded to exactly 2 decimal places.

**Validates: Requirements 3.2, 3.3, 3.7**

### Property 3: Chronological Ordering
*For any* property with multiple price history records, when retrieved with sortOrder='ASC', records SHALL appear in strictly increasing order by timestamp.

**Validates: Requirements 2.1, 6.4**

### Property 4: Pagination Correctness
*For any* paginated request with limit L and offset O, the returned records SHALL be exactly records [O, O+L) from the complete sorted result set, and total count SHALL equal the actual total.

**Validates: Requirements 2.2, 2.3**

### Property 5: Date Range Filtering
*For any* date range filter with startDate S and endDate E, all returned records SHALL have timestamp T where S  T  E, and no records outside this range SHALL be returned.

**Validates: Requirements 2.5**

### Property 6: Permission Enforcement
*For any* user U requesting price history for property P, access SHALL be granted if and only if: U.role = ADMIN OR U.id = P.ownerId OR P.status = ACTIVE.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

### Property 7: Price Validation
*For any* price value submitted for recording, if price  0 or price is not a valid decimal, the system SHALL reject the record creation with a validation error.

**Validates: Requirements 6.1**

### Property 8: Previous Price Consistency
*For any* new price history record, the previousPrice SHALL match the newPrice of the immediately preceding record for the same property, or be the property's initial price if no prior records exist.

**Validates: Requirements 6.2**

### Property 9: Duplicate Prevention
*For any* attempt to create two PriceHistory records with identical propertyId and timestamp, the system SHALL prevent the second record and return a conflict error.

**Validates: Requirements 6.3**

### Property 10: Chart Data Aggregation
*For any* time interval I and date range [S, E], the aggregated data for interval I SHALL contain min, max, first, and last prices that exactly match the corresponding values from the underlying records in that interval.

**Validates: Requirements 4.4, 4.5**

### Property 11: Export Field Inclusion
*For any* export request in format F (csv or json), the exported data SHALL include all required fields: timestamp, previousPrice, newPrice, priceChangePercentage, userId, userRole, changeReason, and metadata.

**Validates: Requirements 8.3**

### Property 12: Bulk Operation Atomicity
*For any* bulk export of properties [P1, P2, ..., Pn], if the user lacks permission for any property Pi, the system SHALL return a 403 error and perform no export.

**Validates: Requirements 12.4, 12.5**

### Property 13: Zero-Change Recording
*For any* price change where newPrice = previousPrice, the system SHALL record the change with priceChangePercentage = 0.00 and not reject the record.

**Validates: Requirements 9.2**

### Property 14: Null Previous Price Handling
*For any* price history record where previousPrice is null or zero, the system SHALL return null for priceChangePercentage rather than attempting division.

**Validates: Requirements 3.4**

### Property 15: Metadata Preservation
*For any* price history record created with metadata M, when the record is retrieved, the metadata SHALL be returned exactly as provided, even if the property is later modified or archived.

**Validates: Requirements 11.4, 11.5, 11.7**

## Conclusion

The Property Price History Tracking feature provides a robust, scalable, and secure system for tracking property price changes over time. By implementing comprehensive audit trails, efficient data retrieval, and flexible visualization options, the system enables users to analyze price trends and maintain compliance with audit requirements. The design follows NestJS best practices, integrates seamlessly with the existing PropChain architecture, and prioritizes performance and data integrity.
