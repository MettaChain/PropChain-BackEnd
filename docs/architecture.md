# Architecture Diagram

```mermaid
graph TB
    Client[Client App] -->|HTTP/WS| Gateway[NestJS Gateway]

    Gateway --> Auth[Auth Module]
    Gateway --> Users[Users Module]
    Gateway --> Properties[Properties Module]
    Gateway --> Transactions[Transactions Module]
    Gateway --> Documents[Documents Module]
    Gateway --> Search[Search Module]
    Gateway --> Admin[Admin Module]
    Gateway --> Fraud[Fraud Module]
    Gateway --> Notifications[Notifications Module]

    Auth --> JWT[JWT Strategy]
    Auth --> Google[Google OAuth]
    Auth --> MFA[2FA / TOTP]
    Auth --> RateLimit[Rate Limit Guard]
    Auth --> APIKeys[API Key Management]

    Users --> Prisma[(Prisma Client)]
    Properties --> Prisma
    Transactions --> Prisma
    Documents --> Prisma
    Search --> Prisma
    Admin --> Prisma
    Fraud --> Prisma

    Prisma --> PostgreSQL[(PostgreSQL)]

    Properties --> Blockchain[Blockchain Service]
    Blockchain --> Ethereum[Ethereum / Sepolia]

    Documents --> Uploads[File Uploads]
    Uploads --> LocalFS[Local FS / S3]

    Notifications --> WebSocket[WebSocket Gateway]
    Notifications --> Email[Email Service]
    Notifications --> SMS[SMS Service]

    Fraud --> Email
    Admin --> Backup[Backup Service]
    Backup --> PgDump[pg_dump]

    Search --> Cache[(Redis Cache)]
    RateLimit --> Cache
    Cache --> CacheWarming[Cache Warming]

    Admin --> BullMQ[BullMQ Queues]
    Transactions --> BullMQ

    Gateway --> GraphQL[GraphQL / Apollo]
```

## Request Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant G as NestJS Gateway
    participant RL as Rate Limit Guard
    participant AU as Auth Service
    participant S as Feature Service
    participant DB as PostgreSQL
    participant BC as Blockchain

    C->>G: HTTP Request
    G->>RL: canActivate()
    RL->>RL: Check Redis counters
    alt Rate limit exceeded
        RL-->>C: 429 Too Many Requests
    else Within limits
        RL->>G: Allow
        G->>AU: Validate JWT
        AU->>AU: Verify token + roles
        AU->>G: Authenticated context
        G->>S: Handle request
        S->>DB: Query/Mutate
        DB-->>S: Result
        alt Blockchain required
            S->>BC: Record transaction
            BC-->>S: Tx hash
        end
        S-->>C: Response
    end
```

## Module Relationships

| Module | Depends On | Provides |
|--------|-----------|----------|
| Auth | Users, JWT, Redis | Authentication, 2FA, API keys |
| Users | Prisma | User CRUD, profiles |
| Properties | Prisma, Blockchain, Geocoding | Property listings, images |
| Transactions | Prisma, Blockchain | Transaction lifecycle |
| Documents | Prisma, Uploads | Document management, signing |
| Search | Prisma, Redis | Full-text search, facets, autocomplete |
| Fraud | Prisma, Email | Fraud detection, alerts, auto-block |
| Admin | Prisma, Backup, BullMQ | Admin ops, backups, reports |
| Notifications | WebSocket, Email, SMS | Real-time + async notifications |
