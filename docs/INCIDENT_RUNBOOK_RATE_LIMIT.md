# Incident Runbook: Rate-Limit Misfire

## Symptoms

- Legitimate users receiving `429 Too Many Requests` unexpectedly
- Rate-limit headers show exhausted counters for low-traffic IPs
- Redis memory growing unbounded on rate-limit keys
- `console.error('Rate limit check error:', error)` appearing in logs

## Diagnosis

### 1. Inspect Redis Rate-Limit Keys

```bash
# Connect to Redis
redis-cli

# List all rate-limit keys
KEYS rate-limit:*

# Check a specific user's counter
HGETALL rate-limit:user:<userId>

# Check IP-based counter
HGETALL rate-limit:ip:<ipAddress>

# Check endpoint-specific counters
HGETALL rate-limit:endpoint:POST:/api/auth/login

# Check TTL on a key
TTL rate-limit:user:<userId>
```

### 2. Check for Key Accumulation

If keys are not expiring:

```bash
# Count total rate-limit keys
SCAN 0 MATCH rate-limit:* COUNT 1000

# Check Redis memory usage
INFO memory
```

### 3. Verify Guard Configuration

Check `src/auth/rate-limit.config.ts` for:
- Window size (should match `RATE_LIMIT_WINDOW_MS`)
- Max requests per window
- Whether endpoint-specific overrides are misconfigured

## Resolution

### Manual Counter Reset

```bash
# Reset a specific user's rate limit
DEL rate-limit:user:<userId>

# Reset an IP's rate limit
DEL rate-limit:ip:<ipAddress>

# Nuclear option — flush all rate-limit keys (CAREFUL)
# Only in production if widespread misfire
redis-cli KEYS "rate-limit:*" | xargs redis-cli DEL
```

### If Redis Is Unreachable

The `RateLimitGuard` catches Redis errors and **allows the request** (fail-open). Check:

1. Redis connection string in `.env` (`REDIS_URL`)
2. Redis server health: `redis-cli ping`
3. Network connectivity between app server and Redis

### If Counters Are Stuck

1. Restart the NestJS application to reinitialize the RateLimitService
2. Check for orphaned keys from previous deployments
3. Verify `cache-manager-redis-store` version compatibility

## Escalation

1. **P1 (production down)**: Page on-call engineer, flush Redis rate-limit keys, restart app
2. **P2 (intermittent 429s)**: Check Redis memory, review rate-limit config, file ticket
3. **P3 (false positives)**: Add IP/user to skip list via `@SkipRateLimit()` decorator

## Prevention

- Monitor Redis memory via `INFO memory` in health checks
- Set `maxmemory-policy allkeys-lru` on Redis to auto-evict stale keys
- Add Grafana alert for `redis_connected_clients` and `used_memory`
