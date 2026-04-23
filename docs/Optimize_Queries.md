# Optimize Queries

## Overview
Optimize database queries to improve application performance, reduce response times, and minimize database load through efficient query patterns, indexing, and monitoring.

## Acceptance Criteria

### N+1 Prevention
1. Identify and eliminate N+1 query patterns
2. Implement eager loading where appropriate
3. Use batch loading techniques
4. Optimize data fetching strategies

### Query Indexing
1. Analyze query patterns and identify slow queries
2. Create appropriate database indexes
3. Monitor index usage and effectiveness
4. Maintain index performance over time

### Slow Query Log
1. Enable database slow query logging
2. Configure appropriate slow query thresholds
3. Implement query analysis and reporting
4. Set up alerts for slow queries

### Optimization
1. Optimize query structure and joins
2. Implement query result caching where appropriate
3. Use database-specific optimization features
4. Regular performance audits and improvements

## Implementation Steps

### 1. N+1 Query Prevention

#### Using Prisma's include for eager loading
```typescript
// Bad: N+1 queries
const users = await prisma.user.findMany();
for (const user of users) {
  const properties = await prisma.property.findMany({
    where: { ownerId: user.id }
  });
}

// Good: Single query with include
const usersWithProperties = await prisma.user.findMany({
  include: {
    properties: true
  }
});
```

#### Using Prisma's select for field limiting
```typescript
const users = await prisma.user.findMany({
  select: {
    id: true,
    name: true,
    properties: {
      select: {
        id: true,
        title: true
      }
    }
  }
});
```

#### Batch loading with DataLoader pattern
```typescript
// Implement DataLoader for batch loading
export class PropertyLoader {
  async loadMany(ownerIds: number[]): Promise<Property[][]> {
    const properties = await prisma.property.findMany({
      where: { ownerId: { in: ownerIds } }
    });
    
    return ownerIds.map(id => 
      properties.filter(prop => prop.ownerId === id)
    );
  }
}
```

### 2. Query Indexing

#### Analyze existing indexes
```sql
-- Check existing indexes
SELECT * FROM pg_indexes WHERE tablename = 'user';

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM user WHERE email = 'test@example.com';
```

#### Add composite indexes for common queries
```sql
-- Index for user authentication
CREATE INDEX idx_user_email_active ON "user"(email, is_active);

-- Index for property searches
CREATE INDEX idx_property_location_price ON property(location, price DESC);

-- Index for trust score queries
CREATE INDEX idx_trust_score_user_date ON trust_score(user_id, created_at DESC);
```

#### Index maintenance
```sql
-- Reindex periodically
REINDEX INDEX idx_user_email_active;

-- Monitor index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch 
FROM pg_stat_user_indexes 
ORDER BY idx_scan DESC;
```

### 3. Slow Query Logging

#### Enable PostgreSQL slow query log
```sql
-- In postgresql.conf
log_min_duration_statement = 1000  -- Log queries taking > 1 second
log_statement = 'ddl'  -- Log DDL statements
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
```

#### Application-level query monitoring
```typescript
@Injectable()
export class QueryLoggerService {
  private readonly logger = new Logger('QueryLogger');

  async logSlowQuery(query: string, duration: number): Promise<void> {
    this.logger.warn(`Slow query detected: ${duration}ms`, {
      query: query.substring(0, 500),
      duration
    });
  }
}

// Prisma middleware for query logging
prisma.$use(async (params, next) => {
  const start = Date.now();
  const result = await next(params);
  const duration = Date.now() - start;

  if (duration > 1000) { // Log queries > 1s
    await queryLogger.logSlowQuery(params.model + '.' + params.action, duration);
  }

  return result;
});
```

### 4. Query Optimization Techniques

#### Use appropriate query methods
```typescript
// Use findFirst for single records
const user = await prisma.user.findFirst({
  where: { email: email }
});

// Use count for counting
const totalUsers = await prisma.user.count();

// Use aggregation for calculations
const avgPrice = await prisma.property.aggregate({
  _avg: { price: true }
});
```

#### Implement query result caching
```typescript
@Injectable()
export class CacheService {
  async getCachedQuery<T>(
    key: string, 
    queryFn: () => Promise<T>, 
    ttl: number = 300
  ): Promise<T> {
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached);
    
    const result = await queryFn();
    await this.redis.setex(key, ttl, JSON.stringify(result));
    return result;
  }
}

// Usage
const properties = await this.cacheService.getCachedQuery(
  `properties:${userId}`,
  () => prisma.property.findMany({ where: { ownerId: userId } })
);
```

#### Optimize complex queries
```typescript
// Use raw SQL for complex aggregations when necessary
const complexQuery = await prisma.$queryRaw`
  SELECT 
    u.name,
    COUNT(p.id) as property_count,
    AVG(p.price) as avg_price
  FROM "user" u
  LEFT JOIN property p ON u.id = p.owner_id
  GROUP BY u.id, u.name
  HAVING COUNT(p.id) > 0
`;
```

## Monitoring and Maintenance

### Performance Metrics
- Query execution time
- Database connection pool usage
- Cache hit/miss ratios
- Index usage statistics

### Regular Audits
- Monthly query performance review
- Index maintenance and cleanup
- Cache strategy evaluation
- Database vacuum and analyze operations

## Testing
- Unit tests for query optimization logic
- Integration tests with realistic data volumes
- Performance benchmarks before/after optimization
- Load testing with concurrent users