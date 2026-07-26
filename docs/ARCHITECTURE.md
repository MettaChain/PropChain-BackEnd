# PropChain Backend Architecture

## Tech Stack

| Layer            | Technology                               |
| ---------------- | ---------------------------------------- |
| Runtime          | Node.js >= 18                            |
| Framework        | NestJS 10                                |
| Language         | TypeScript 5.3                           |
| Database         | PostgreSQL (via Prisma ORM 6.x)          |
| Cache            | Redis (via ioredis + cache-manager)      |
| API              | REST (Express) + GraphQL (Apollo Server) |
| Authentication   | Passport.js (JWT + Google OAuth2)        |
| Blockchain       | Web3.js / Ethers.js 6                    |
| Job Queue        | BullMQ (Redis-backed)                    |
| Email            | Nodemailer via @nestjs-modules/mailer    |
| Image Processing | Sharp                                    |
| PDF Generation   | PDFKit                                   |
| Documentation    | Swagger / OpenAPI                        |
| Testing          | Jest + Supertest                         |
| Monitoring       | Prometheus (prom-client)                 |
| Realtime         | Socket.IO (WebSockets)                   |

## Directory Structure

```
propchain-backend/
├── prisma/
│   ├── schema.prisma          # Database schema
│   ├── seed.ts                # Seed script
│   └── migrations/            # Migration history
├── src/
│   ├── main.ts                # Application bootstrap
│   ├── app.module.ts          # Root module
│   ├── app.controller.ts      # Health check / root routes
│   ├── admin/                 # Admin panel & management
│   ├── analytics/             # Search & property analytics
│   ├── audit/                 # Audit logging
│   ├── auth/                  # Auth (JWT, OAuth, guards, RBAC)
│   ├── backup/                # Database backup/restore
│   ├── blockchain/            # On-chain recording & verification
│   ├── cache/                 # Redis caching layer
│   ├── commissions/           # Agent commission tracking
│   ├── common/                # Shared types, middleware, decorators
│   ├── config/                # Swagger, env validation
│   ├── content/               # Content management
│   ├── dashboard/             # Dashboard aggregations
│   ├── database/              # Prisma service & module
│   ├── documents/             # Document upload, versioning, signing
│   ├── duplicate-detection/   # Property duplicate detection
│   ├── email/                 # Email sending
│   ├── email-digest/          # Digest emails
│   ├── favorites/             # User favorites/bookmarks
│   ├── fraud/                 # Fraud detection & investigation
│   ├── integrations/          # Third-party adapters
│   ├── metrics/               # Prometheus metrics
│   ├── mortgage-calculator/   # Mortgage estimation
│   ├── neighborhoods/         # Neighborhoods, schools, amenities
│   ├── notifications/         # Push, in-app, SMS notifications
│   ├── open-house/            # Open house scheduling & RSVP
│   ├── properties/            # Core property CRUD & images
│   ├── property-comparison/   # Side-by-side comparison
│   ├── property-views/        # View tracking & analytics
│   ├── search/                # Full-text search & suggestions
│   ├── sessions/              # User session management
│   ├── support-tickets/       # Support ticket system
│   ├── tracking/              # Link click tracking
│   ├── transactions/          # Transaction lifecycle
│   ├── trust-score/           # User trust scoring
│   ├── types/                 # Shared TypeScript types
│   ├── users/                 # User profiles & preferences
│   ├── utils/                 # Utility functions
│   ├── versioning/            # API versioning
│   └── webhooks/              # Webhook management
├── test/                      # E2E tests
├── docs/                      # Developer documentation
└── package.json
```

## Module Dependency Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          AppModule                                  │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Config   │  │ Prisma   │  │ GraphQL  │  │ ScheduleModule   │   │
│  │ Module   │  │ Module   │  │ Module   │  │                  │   │
│  └────┬─────┘  └────┬─────┘  └──────────┘  └──────────────────┘   │
│       │              │                                              │
│  ┌────▼──────────────▼────────────────────────────────────────────┐ │
│  │                    Core Infrastructure                         │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐     │ │
│  │  │ Cache    │ │ Auth     │ │Database  │ │ Rate Limit   │     │ │
│  │  │ Module   │ │ Module   │ │ Module   │ │ Service      │     │ │
│  │  └──────────┘ └────┬─────┘ └──────────┘ └──────────────┘     │ │
│  └─────────────────────┼─────────────────────────────────────────┘ │
│                        │                                            │
│  ┌─────────────────────▼─────────────────────────────────────────┐ │
│  │                     Feature Modules                            │ │
│  │                                                                │ │
│  │  ┌───────────┐  ┌────────────┐  ┌──────────────────────┐     │ │
│  │  │Properties │  │Transactions│  │     Documents        │     │ │
│  │  │  Module   │──│   Module   │──│      Module          │     │ │
│  │  └─────┬─────┘  └─────┬──────┘  └──────────────────────┘     │ │
│  │        │               │                                       │ │
│  │  ┌─────▼─────┐  ┌─────▼──────┐  ┌──────────────────────┐     │ │
│  │  │Property   │  │Commissions │  │  Neighborhoods       │     │ │
│  │  │ Images    │  │  Module    │  │     Module           │     │ │
│  │  │  Module   │  └────────────┘  └──────────────────────┘     │ │
│  │  └───────────┘                                                │ │
│  │                                                                │ │
│  │  ┌───────────┐  ┌────────────┐  ┌──────────────────────┐     │ │
│  │  │Favorites  │  │  Search    │  │    Notifications     │     │ │
│  │  │  Module   │  │  Module    │  │       Module         │     │ │
│  │  └───────────┘  └────────────┘  └──────────────────────┘     │ │
│  │                                                                │ │
│  │  ┌───────────┐  ┌────────────┐  ┌──────────────────────┐     │ │
│  │  │  Fraud    │  │  Blockchain│  │    Analytics         │     │ │
│  │  │  Module   │  │  Module    │  │      Module          │     │ │
│  │  └───────────┘  └────────────┘  └──────────────────────┘     │ │
│  │                                                                │ │
│  │  ┌───────────┐  ┌────────────┐  ┌──────────────────────┐     │ │
│  │  │  Admin    │  │   Backup   │  │     Metrics          │     │ │
│  │  │  Module   │  │  Module    │  │      Module          │     │ │
│  │  └───────────┘  └────────────┘  └──────────────────────┘     │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow Overview

### Request Lifecycle

```
Client Request
    │
    ▼
┌──────────────────┐
│  Rate Limiting   │  IP-based + user-based throttling
│  (Guard)         │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  JWT Auth        │  Token validation, session check
│  (Guard)         │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  RBAC Guard      │  Role + permission checking
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  ValidationPipe  │  DTO validation, whitelisting
│  (NestJS)        │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Controller      │  Route handling
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Service         │  Business logic, authorization
└────────┬─────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────┐
│ Prisma │ │ Redis  │
│ (PostgreSQL)  │ Cache  │
└────────┘ └────────┘
```

### Property Image Pipeline

```
Upload (multer/memory buffer)
    │
    ▼
┌──────────────────────┐
│ Validate             │  Size, mime type, per-property cap
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Sharp Pipeline        │  Auto-rotate, resize, convert
│ ├── Full (1920px)    │  WebP quality 85
│ ├── Medium (800px)   │  WebP quality 80
│ └── Thumbnail (300px)│  WebP quality 75
│ Strip EXIF metadata   │  Privacy protection
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Duplicate Detection   │  Perceptual hash (SHA-256 prefix)
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Persist to DB + Disk │  PropertyImage record + files on disk
└──────────────────────┘
```

### Transaction Lifecycle

```
PENDING → UNDER_CONTRACT → COMPLETED
   │              │
   └── CANCELLED ─┘

Each state change:
  1. Validate transition (status machine)
  2. Update property status
  3. Record transaction history
  4. Emit notifications
  5. Optional: record on blockchain
```

## Key Design Decisions

1. **Dual API Surface**: REST (primary) + GraphQL (queries/subscriptions)
2. **Prisma as Single Source of Truth**: All DB access through PrismaService
3. **Decorator-based RBAC**: `@RequirePermissions()` for endpoint authorization
4. **Event-Driven Notifications**: WebSocket gateway for real-time delivery
5. **Blockchain as Audit Trail**: Optional on-chain recording for transactions
6. **Image Variants via Sharp**: Three sizes generated at upload time, stored on disk
7. **Fraud Detection Pipeline**: Pattern matching with configurable severity levels
