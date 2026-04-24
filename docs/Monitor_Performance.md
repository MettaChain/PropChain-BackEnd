# Monitor Performance

## Overview
Implement comprehensive application performance monitoring to track response times, error rates, throughput, and set up alerting for proactive issue detection and resolution.

## Acceptance Criteria

### Response Times
1. Monitor API endpoint response times
2. Track database query execution times
3. Measure third-party service response times
4. Set up response time percentiles (P50, P95, P99)

### Error Rates
1. Track HTTP error rates (4xx, 5xx)
2. Monitor application exceptions and errors
3. Log database connection errors
4. Track validation errors and bad requests

### Throughput
1. Monitor requests per second (RPS)
2. Track concurrent connections
3. Measure database transactions per second
4. Monitor queue processing rates

### Alerts
1. Set up alerts for high error rates
2. Configure alerts for slow response times
3. Monitor resource utilization thresholds
4. Implement escalation policies

## Implementation Steps

### 1. Response Time Monitoring

#### NestJS Response Time Middleware
```typescript
@Injectable()
export class ResponseTimeMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: Function) {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      const method = req.method;
      const url = req.url;
      
      // Log response time
      this.logger.log(`Response time: ${method} ${url} - ${duration}ms`);
      
      // Send to monitoring service
      this.monitoringService.recordResponseTime(method, url, duration);
    });
    
    next();
  }
}
```

#### Database Query Monitoring
```typescript
// Prisma middleware for query timing
prisma.$use(async (params, next) => {
  const start = Date.now();
  const result = await next(params);
  const duration = Date.now() - start;
  
  // Record query metrics
  this.metricsService.recordQueryTime(
    params.model, 
    params.action, 
    duration
  );
  
  return result;
});
```

### 2. Error Rate Monitoring

#### Global Exception Filter
```typescript
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    
    let status = 500;
    let message = 'Internal server error';
    
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
    }
    
    // Record error metrics
    this.monitoringService.recordError(status, request.url, exception);
    
    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
```

#### Error Rate Tracking
```typescript
@Injectable()
export class MonitoringService {
  private errorCounts = new Map<string, number>();
  
  recordError(status: number, url: string, error: any): void {
    const key = `${status}:${url}`;
    const count = this.errorCounts.get(key) || 0;
    this.errorCounts.set(key, count + 1);
    
    // Check error rate thresholds
    if (this.isHighErrorRate(key)) {
      this.alertService.sendAlert('High error rate detected', {
        status,
        url,
        errorCount: count + 1
      });
    }
  }
}
```

### 3. Throughput Monitoring

#### Request Throughput Tracking
```typescript
@Injectable()
export class ThroughputService {
  private requestCount = 0;
  private readonly windowSize = 60000; // 1 minute
  
  recordRequest(): void {
    this.requestCount++;
    
    // Reset counter periodically
    setInterval(() => {
      const rps = this.requestCount / (this.windowSize / 1000);
      this.metricsService.recordThroughput(rps);
      this.requestCount = 0;
    }, this.windowSize);
  }
}
```

#### Database Connection Pool Monitoring
```typescript
@Injectable()
export class DatabaseMonitoringService {
  constructor(private prisma: PrismaService) {}
  
  async getConnectionStats() {
    const stats = await this.prisma.$queryRaw`
      SELECT 
        count(*) as total_connections,
        count(*) filter (where state = 'active') as active_connections,
        count(*) filter (where state = 'idle') as idle_connections
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `;
    
    return stats;
  }
  
  startMonitoring(): void {
    setInterval(async () => {
      const stats = await this.getConnectionStats();
      this.metricsService.recordDbConnections(stats);
    }, 30000); // Every 30 seconds
  }
}
```

### 4. Alerting System

#### Alert Service Implementation
```typescript
@Injectable()
export class AlertService {
  constructor(private emailService: EmailService) {}
  
  async sendAlert(title: string, details: any): Promise<void> {
    // Log alert
    this.logger.error(`ALERT: ${title}`, details);
    
    // Send email notification
    await this.emailService.sendAlertEmail(
      process.env.ALERT_EMAIL,
      title,
      JSON.stringify(details, null, 2)
    );
    
    // Send to external monitoring service (e.g., PagerDuty, Slack)
    await this.externalAlertService.notify(title, details);
  }
}
```

#### Alert Rules Configuration
```typescript
export interface AlertRule {
  name: string;
  condition: (metrics: Metrics) => boolean;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export const ALERT_RULES: AlertRule[] = [
  {
    name: 'High Error Rate',
    condition: (metrics) => metrics.errorRate > 0.05, // 5% error rate
    message: 'Error rate exceeds 5%',
    severity: 'high'
  },
  {
    name: 'Slow Response Time',
    condition: (metrics) => metrics.p95ResponseTime > 5000, // 5 seconds
    message: 'P95 response time exceeds 5 seconds',
    severity: 'medium'
  },
  {
    name: 'High CPU Usage',
    condition: (metrics) => metrics.cpuUsage > 0.9, // 90% CPU
    message: 'CPU usage exceeds 90%',
    severity: 'high'
  }
];
```

### 5. Metrics Collection and Storage

#### Prometheus Integration
```typescript
// Install: npm install prom-client
import { register, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly responseTimeHistogram = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.5, 1, 2, 5, 10]
  });
  
  constructor() {
    collectDefaultMetrics();
  }
  
  recordResponseTime(method: string, route: string, duration: number, statusCode: number = 200): void {
    this.responseTimeHistogram
      .labels(method, route, statusCode.toString())
      .observe(duration / 1000);
  }
  
  getMetrics(): Promise<string> {
    return register.metrics();
  }
}
```

#### Metrics Endpoint
```typescript
@Controller('metrics')
export class MetricsController {
  constructor(private metricsService: MetricsService) {}
  
  @Get()
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }
}
```

### 6. Dashboard and Visualization

#### Grafana Dashboard Setup
- Install Grafana and connect to Prometheus
- Create dashboards for:
  - Response time graphs (P50, P95, P99)
  - Error rate trends
  - Throughput charts
  - Resource utilization (CPU, Memory, DB connections)

#### Custom Dashboards
```typescript
// Example dashboard configuration
export const PERFORMANCE_DASHBOARD = {
  title: 'Application Performance',
  panels: [
    {
      title: 'Response Times',
      type: 'graph',
      targets: [
        {
          expr: 'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))',
          legendFormat: 'P95'
        }
      ]
    },
    {
      title: 'Error Rate',
      type: 'graph',
      targets: [
        {
          expr: 'rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) * 100',
          legendFormat: '5xx Error Rate %'
        }
      ]
    }
  ]
};
```

## Testing and Validation

### Load Testing
```bash
# Use Artillery or k6 for load testing
npx artillery quick --count 50 --num 10 http://localhost:3000/api/users

# Monitor metrics during load test
curl http://localhost:3000/metrics
```

### Alert Testing
- Simulate high error rates
- Test slow response scenarios
- Verify alert notifications
- Test escalation procedures

### Monitoring Validation
- Verify all metrics are being collected
- Check dashboard accuracy
- Validate alert thresholds
- Test monitoring system reliability

## Maintenance
- Regular review of alert thresholds
- Update monitoring configurations
- Archive old metrics data
- Upgrade monitoring tools and dependencies