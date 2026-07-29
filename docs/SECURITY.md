# PropChain Security Guide

## Authentication Flow

### JWT + Refresh Token Rotation

```
Login Request
    │
    ▼
┌─────────────────────┐
│  Validate Credentials│  bcrypt compare
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Generate Tokens     │
│  ├── Access Token    │  Short-lived (15 min)
│  │   (JWT, signed)   │  Contains: userId, role, jti
│  └── Refresh Token   │  Long-lived (7 days)
│      (JWT, signed)   │  Contains: userId, jti, tokenFamily
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Store Session       │  DB record with jti, IP, user agent
└─────────────────────┘

Token Refresh Flow:
  1. Client sends refresh token
  2. Server validates token is not blacklisted
  3. Server generates NEW access + refresh token pair
  4. Old refresh token is blacklisted
  5. Token family tracked for reuse detection

Token Reuse Detection:
  - If a blacklisted refresh token is reused →
    all tokens in that family are invalidated
  - User must re-authenticate
```

### Google OAuth2 Flow

```
1. Client redirects to Google OAuth consent screen
2. Google redirects back with authorization code
3. Backend exchanges code for tokens
4. Backend fetches user profile from Google
5. Find or create user in database
6. Issue JWT tokens
```

## Role-Based Access Control (RBAC)

### Roles

| Role  | Level | Description                                     |
| ----- | ----- | ----------------------------------------------- |
| USER  | 10    | Standard user - browse, favorite, basic actions |
| AGENT | 50    | Property management, listings, transactions     |
| ADMIN | 100   | Full system access, all permissions             |

### Permission Matrix

| Resource     | create | read | update | delete | approve | verify |
| ------------ | ------ | ---- | ------ | ------ | ------- | ------ |
| users        | ADMIN  | ALL  | ADMIN  | ADMIN  | -       | -      |
| properties   | AGENT+ | ALL  | OWNER+ | OWNER+ | ADMIN   | -      |
| transactions | AGENT+ | ALL  | AGENT+ | -      | -       | -      |
| documents    | ALL    | ALL  | OWNER  | -      | -       | ADMIN  |

### Guard Chain

```
Request → AuthGuard(JWT) → RolesGuard → RequirePermissions → Controller
```

Each guard checks:

1. `AuthGuard`: Valid JWT, not blacklisted, session exists
2. `RolesGuard`: User role meets minimum level
3. `RequirePermissions`: User has specific resource:action permission

## Rate Limiting

### Strategy

| Tier    | Limit        | Window | Scope        |
| ------- | ------------ | ------ | ------------ |
| General | 100 requests | 1 min  | Per IP       |
| Auth    | 5 requests   | 15 min | Per IP+email |
| Write   | 30 requests  | 1 min  | Per user     |
| Search  | 60 requests  | 1 min  | Per user     |

### Implementation

- **Guards**: `RateLimitGuard` checks limits before controller
- **Storage**: Redis counters with TTL
- **Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLockout-Reset`
- **Lockout**: After `maxAttempts` failures, account is temporarily locked

### Login Rate Limiting

```
Attempt 1-4:  Track failures, return 401
Attempt 5:    Lock account for 15 minutes, return 429
After lockout: Reset failure counter
```

## Input Validation

### Global ValidationPipe

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // Strip unknown properties
    forbidNonWhitelisted: true, // Throw on unknown properties
    transform: true, // Auto-transform to DTO types
    transformOptions: {
      enableImplicitConversion: true,
    },
  }),
);
```

### DTO Validation

- All request bodies validated via `class-validator`
- String fields: `@IsString()`, `@MaxLength()`
- Numeric fields: `@IsNumber()`, `@Min()`, `@Max()`
- Arrays: `@IsArray()`, `@ArrayUnique()`
- UUIDs: `@IsUUID('4', { each: true })`

### SQL Injection Prevention

- All queries through Prisma ORM (parameterized)
- No raw SQL unless using `Prisma.$queryRaw` with template literals

## CORS Configuration

```typescript
app.enableCors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  credentials: true,
  allowedHeaders: 'Content-Type,Authorization,X-Request-ID',
});
```

## Content Security Policy

Default CSP headers (configurable):

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self';
connect-src 'self' wss:;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

## Sensitive Data Protection

### What We Never Commit

- `.env` files (in `.gitignore`)
- JWT secrets
- Database passwords
- API keys
- Private keys
- Session tokens

### Password Handling

- Stored as bcrypt hashes (12 rounds)
- Password history tracked (prevent reuse)
- Minimum 8 characters enforced
- Stored in `users` table, never in logs

### EXIF Data Stripping

All uploaded property images have EXIF metadata removed:

- GPS coordinates (privacy)
- Camera serial numbers
- Timestamps
- Software identifiers

This happens automatically in the image optimization pipeline.

## Security Headers

Additional security headers applied via middleware:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

## Fraud Detection

### Pattern Detection

| Pattern                        | Severity | Auto-Block |
| ------------------------------ | -------- | ---------- |
| Excessive failed logins        | HIGH     | Yes        |
| Shared IP multiple accounts    | MEDIUM   | No         |
| Multiple IPs for one account   | HIGH     | No         |
| New device login               | LOW      | No         |
| Token reuse detected           | CRITICAL | Yes        |
| Rapid property listings        | MEDIUM   | No         |
| Duplicate property addresses   | LOW      | No         |
| High-value listing new account | HIGH     | No         |

### Investigation Workflow

```
Alert Created → Assigned to Admin → Investigate → Resolve/Dismiss
                                        │
                                        ├── Add notes
                                        ├── Block/unblock user
                                        └── Escalate if needed
```

## Audit Logging

All sensitive operations are logged:

- Login/logout events
- Role changes
- Property CRUD
- Transaction state changes
- Document uploads/downloads
- Admin actions

Logs include: userId, action, IP, user agent, timestamp, entity details.
