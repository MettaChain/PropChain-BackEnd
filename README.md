# PropChain - Blockchain-Powered Real Estate Platform

A modern, scalable backend API for real estate transactions built with NestJS and PostgreSQL

## 🚀 Features

- **User Management** - Registration, authentication, and profile management
- **Property Listings** - Create, manage, and search property listings
- **Transaction Tracking** - Record and track real estate transactions
- **Tax Strategy Suggestions** - Store informational, non-binding tax structuring suggestions for transactions
- **Document Management** - Store and manage property-related documents
- **Role-Based Access Control** - USER, AGENT, ADMIN roles with route protection
- **Clean Architecture** - Modular, testable, and maintainable code structure
- **Fraud Detection** - Login and listing risk rules with alerts and auto-block
- **Search** - Filters, facets, autocomplete and privacy-aware analytics
- **Real-time Notifications** - WebSocket, in-app and SMS delivery
- **Blockchain Recording** - On-chain transaction recording
- **Operations** - Scheduled backups, audit retention, Redis caching, Prometheus metrics, K8s health probes
- **CI/CD Pipeline** - Lint, migration safety, tests, coverage and build jobs (see [Deployment & CI](#-deployment--ci))

## 🔐 Role-Based Access Control (RBAC)

The application implements comprehensive RBAC with three user roles:

### User Roles

- **USER**: Default role for registered users. Can create properties and manage their own data.
- **AGENT**: Can manage properties and assist with transactions.
- **ADMIN**: Full system access including user management, property administration, and system configuration.

### Route Protection

Routes are protected using decorators:

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Get('admin/users')
getAllUsers() {
  // Only admins can access
}
```

### Default Role Assignment

New users are automatically assigned the `USER` role upon registration.

## 🔑 Password Reset

The application provides secure password reset functionality via email:

### Password Reset Flow

1. **Request Reset**: User submits email address
2. **Token Generation**: Secure reset token created (expires in 1 hour)
3. **Email Delivery**: Reset link sent to user's email
4. **Token Validation**: Token verified on password reset
5. **Password Update**: New password hashed and stored

### API Endpoints

```bash
# Request password reset
POST /auth/password-reset/request
{
  "email": "user@example.com"
}

# Reset password with token
POST /auth/password-reset/reset
{
  "token": "reset-token-here",
  "newPassword": "NewSecurePassword123!"
}
```

### Security Features

- **Token Expiration**: Reset tokens expire after 1 hour
- **Single Use**: Tokens can only be used once
- **Password History**: Prevents reuse of recent passwords
- **Rate Limiting**: Previous tokens invalidated on new request
- **Blocked User Protection**: No emails sent to blocked accounts

## 📋 Prerequisites

- Node.js >= 18.0.0
- PostgreSQL >= 14
- npm >= 10.0.0
- Redis >= 6 (cache, WebSocket presence, BullMQ queues)

## 🛠️ Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Set up your database URL in .env file
```

## 🐳 Docker Workflow (#1175)

A production `Dockerfile` is included and `docker-compose.yml` wires up the
full stack (`app`, `postgres`, `pgbouncer`, `redis`).

```bash
# Build and boot the full stack
docker compose up --build

# Verify container health (GET /healthz returns 200)
curl -fsSL http://localhost:3000/healthz

# Tear down (including volumes)
docker compose down -v
```

- The `app` container applies pending Prisma migrations (`prisma migrate deploy`)
  via `docker-entrypoint.sh` before starting `node dist/main`.
- Health checks: `postgres`/`pgbouncer`/`redis` use their native probes; the
  `app` service probes `GET /healthz`.
- Override secrets via `.env` variables: `POSTGRES_PASSWORD`, `JWT_SECRET`,
  `JWT_REFRESH_SECRET`, `REDIS_PASSWORD`. The JWT secrets must each be at
  least 32 characters or the app will refuse to boot.

## ⚙️ Configuration

The application uses environment variables for configuration. Copy `.env.example` to `.env` and adjust the values as needed.

### Environment Variables

| Variable                          | Description                                                | Default                             |
| :-------------------------------- | :--------------------------------------------------------- | :---------------------------------- |
| `DATABASE_URL`                    | PostgreSQL connection string                               | Required                            |
| `PORT`                            | Server port                                                | 3000                                |
| `NODE_ENV`                        | Environment mode                                           | development                         |
| `FRONTEND_URL`                    | Frontend application URL for email links                   | http://localhost:3000               |
| `JWT_SECRET`                      | JWT signing secret                                         | Required                            |
| `JWT_REFRESH_SECRET`              | JWT refresh token secret                                   | Required                            |
| `JWT_ACCESS_EXPIRES_IN`           | Access token expiration                                    | 15m                                 |
| `JWT_REFRESH_EXPIRES_IN`          | Refresh token expiration                                   | 7d                                  |
| `BCRYPT_ROUNDS`                   | Password hashing rounds                                    | 12                                  |
| `PASSWORD_HISTORY_LIMIT`          | Password history limit                                     | 5                                   |
| `PASSWORD_MIN_LENGTH`             | Minimum password length                                    | 8                                   |
| `PASSWORD_REQUIRE_UPPERCASE`      | Require uppercase in password                              | true                                |
| `PASSWORD_REQUIRE_LOWERCASE`      | Require lowercase in password                              | true                                |
| `PASSWORD_REQUIRE_DIGIT`          | Require digit in password                                  | true                                |
| `PASSWORD_REQUIRE_SPECIAL`        | Require special char in password                           | true                                |
| `PASSWORD_SPECIAL_CHARS`          | Allowed special characters                                 | !@#$%^&\*()\_+-=...                 |
| `FRONTEND_URL`                    | Frontend application URL for email links                   | http://localhost:3000               |
| `RECAPTCHA_SECRET`                | Google reCAPTCHA v3 private key                            | Required                            |
| `CAPTCHA_THRESHOLD`               | Minimum reCAPTCHA score to pass                            | 0.5                                 |
| `BASE_URL`                        | Root URL of this API server                                | http://localhost:3000               |
| `API_URL`                         | Full API base URL for email links                          | http://localhost:3000/api           |
| `AVATAR_UPLOAD_DIR`               | Directory for user avatar uploads                          | ./uploads/avatars                   |
| `AVATAR_MAX_FILE_SIZE`            | Max avatar file size in bytes                              | 5242880                             |
| `CORS_ORIGINS`                    | Comma-separated allowed origins                            | http://localhost:3000               |
| `DEBUG_PII`                       | Enable PII debugging in auth logs                          | false                               |
| `EMAIL_VERIFICATION_EXPIRES_IN`   | Email verification token TTL                               | 24h                                 |
| `GOOGLE_CLIENT_ID`                | Google OAuth2 client ID                                    | —                                   |
| `GOOGLE_CLIENT_SECRET`            | Google OAuth2 client secret                                | —                                   |
| `GOOGLE_CALLBACK_URL`             | Google OAuth2 callback URL                                 | /api/auth/google/callback           |
| `BLOCKCHAIN_ENABLED`              | Enable blockchain integration                              | true                                |
| `BLOCKCHAIN_NETWORK`              | Ethereum network                                           | sepolia                             |
| `BLOCKCHAIN_RPC_URL`              | Ethereum RPC endpoint (validated at boot)                  | —                                   |
| `BLOCKCHAIN_CONTRACT_ADDRESS`     | Smart contract address (EIP-55 checksum validated at boot) | —                                   |
| `BLOCKCHAIN_PRIVATE_KEY`          | Wallet private key for signing (validated at boot)         | —                                   |
| `BACKUP_STORAGE_PATH`             | Directory for DB backup files                              | ./backups                           |
| `PG_DUMP_PATH`                    | Path to pg_dump binary                                     | pg_dump                             |
| `PSQL_PATH`                       | Path to psql binary                                        | psql                                |
| `PROPERTY_IMAGES_UPLOAD_DIR`      | Directory for property images                              | ./uploads/properties                |
| `PROPERTY_IMAGE_MAX_SIZE`         | Max property image size in bytes                           | 10485760                            |
| `PROPERTY_IMAGE_MAX_PER_PROPERTY` | Max images per property                                    | 30                                  |
| `GEOCODING_PROVIDER`              | Geocoding provider (nominatim/google)                      | nominatim                           |
| `NOMINATIM_BASE_URL`              | Nominatim API base URL                                     | https://nominatim.openstreetmap.org |
| `GEOCODING_USER_AGENT`            | User agent for geocoding requests                          | PropChain-Backend/1.0               |
| `GEOCODING_TIMEOUT_MS`            | Geocoding request timeout (ms)                             | 5000                                |
| `GOOGLE_GEOCODING_API_KEY`        | Google Geocoding API key (optional)                        | —                                   |
| `FRAUD_ALERT_RECIPIENTS`          | Comma-separated fraud alert emails                         | —                                   |
| `CACHE_WARMING_ENABLED`           | Enable cache warming on startup                            | false                               |
| `CACHE_WARMING_INTERVAL`          | Cache warming interval (ms)                                | —                                   |
| `TEST_DATABASE_URL`               | PostgreSQL URL for integration tests                       | —                                   |

## 🗄️ Database Setup

```bash
# Generate Prisma Client
npm run db:generate

# Run migrations
npm run migrate

# (Optional) Seed database
npm run db:seed
```

Seeding is scoped by `SEED_ENV` (default `development`). Re-running the same
scope is idempotent because the completed scope is marked in the database.
Set `SEED_RESET=true` only when a destructive reset is intended. Production
seeding is blocked unless `SEED_ALLOW_IN_PRODUCTION=true` is set explicitly.

## 🏃 Running the App

```bash
# Development mode
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

## 🧪 Testing

Jest picks up every `*.spec.ts` file under `src/` and `test/` (`jest.config.js`).

| Command                 | What it runs                                                              |
| ----------------------- | ------------------------------------------------------------------------- |
| `npm test`              | All unit + e2e specs (excludes `test/database/`)                          |
| `npm run test:database` | DB-backed suites in `test/database/`, serially (`--runInBand`)            |
| `npm run test:all`      | `npm test` then `test:database`. **This is what CI runs**                 |
| `npm run test:cov`      | Tests with coverage; fails below the thresholds in `jest.config.js`       |
| `npm run test:watch`    | Watch mode                                                                |
| `npm run test:debug`    | Run Jest under the Node inspector                                         |
| `npm run check:i18n`    | Translation key symmetry check (`src/i18n/translations.symmetry.spec.ts`) |

Test layout:

```
src/**/*.spec.ts     # unit tests next to the code
test/unit/           # cross-module unit tests
test/e2e/            # HTTP-level tests (admin API, documents, disputes, auth…)
test/database/       # integration tests against a real Postgres (TEST_DATABASE_URL)
test/{admin,auth,backup,cache,sessions,transactions,users}/  # feature suites
```

For database-backed tests, set `TEST_DATABASE_URL` to a dedicated test database. `test/database/prisma-test-helpers.ts` cleans fixtures and resets seeded state between suites.

**Coverage thresholds** (enforced by `test:cov`) are a global baseline of 24% statements / 16% branches / 17% functions / 24% lines, with stricter per-module floors for `src/auth/`, `src/documents/`, `src/sessions/` and others. See `jest.config.js`.

> Note: `jest.config.js` lists `/test/database/` in `testPathIgnorePatterns`, which also applies when that path is passed on the CLI. Check that `npm run test:database` actually executes suites (`npx jest test/database --listTests`) before relying on it.

## 📁 Project Structure

The full architecture write-up is in [docs/architecture.md](docs/architecture.md).

```
src/
├── main.ts                 # Bootstrap: Swagger (/api/docs), metrics listener, global pipes
├── app.module.ts           # Root module: wires feature modules, global filters & interceptors
├── app.controller.ts
│
├── auth/                   # JWT + refresh tokens, API keys, MFA, login rate limiting, RBAC guards
├── users/                  # Profiles, preferences, avatars, KYC docs, activity logs, CSV import, search
├── sessions/               # Active session listing & revocation
├── properties/             # Listings, images, geocoding, expiry, tax strategy (properties/tax)
├── transactions/           # Transaction lifecycle, disputes, timeline, cancellation, audit
├── documents/              # Upload, versioning, signed download URLs, expiry
├── blockchain/             # On-chain recording, contracts, blockchain audit trail
├── commissions/            # Agent commission calculation
├── trust-score/            # User trust score + leaderboard
├── fraud/                  # Fraud rules, alerts, auto-block
├── admin/                  # Admin back office + BullMQ queue management
├── search/                 # Property search, facets, autocomplete, analytics
├── notifications/          # In-app, WebSocket presence, SMS
├── email/                  # Email service, BullMQ mail processor, templates, provider webhooks
├── backup/                 # pg_dump backups, schedule, retention, restore
├── archive/                # Data archival strategy (#919)
├── audit/                  # Audit history retention / pruning
├── cache/                  # Redis cache, warming, invalidation, metrics
├── …                       # every other module is listed in the Modules table below
│
├── common/                 # Filters, interceptors, logger, request-id middleware, security utils
├── config/                 # Swagger/OpenAPI config & API docs controller
├── database/               # PrismaService, cleanup cron (#920)
├── i18n/                   # Translations + localized errors (#964)
├── versioning/             # API versioning, deprecation headers
└── types/, utils/          # Shared types and helpers

prisma/
├── schema.prisma           # Database schema
├── migrations/             # Migration history (validated in CI)
└── seed.ts                 # Seed data

scripts/
├── setup.sh                # One-command dev onboarding (#926)
├── validate-migrations.ts  # Blocks destructive migrations (CI)
└── benchmark.ts            # API benchmark (benchmark workflow)

test/                       # Unit, e2e and DB integration suites
docs/                       # Guides & runbooks
```

## 🧩 Modules

Status: ✅ imported by `AppModule` (directly or transitively) · ⚠️ code exists but the module is **not imported anywhere**, so its routes and jobs are inactive.

| Module                | Purpose                                                                         | Base route(s)                         | Status | Docs                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------- | ------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin`               | Admin back office: users, moderation, fraud, backups, archive, API keys, queues | `/admin/*`                            | ✅     | [README](src/admin/README.md)                                                                                                                     |
| `analytics`           | Request/usage analytics                                                         | `/analytics`                          | ✅     |                                                                                                                                                   |
| `archive`             | Data archival strategy & restore                                                | via `/admin/archive/*`                | ✅     |                                                                                                                                                   |
| `audit`               | Daily archive + prune of history tables (365 days)                              | (cron only)                           | ✅     | [README](src/audit/README.md)                                                                                                                     |
| `auth`                | Login, JWT/refresh, API keys, MFA, rate limiting, RBAC                          | `/auth`, `/admin/rate-limits`         | ✅     | [Auth & Users](docs/Auth_and_User_APIs.md), [Login rate limiting](docs/LOGIN_RATE_LIMITING.md), [RBAC matrix](docs/RBAC_Permission_Matrix.md)     |
| `backup`              | `pg_dump` backups, schedule, retention, restore                                 | via `/admin/backups/*`                | ✅     | [README](src/backup/README.md)                                                                                                                    |
| `blockchain`          | On-chain recording & contract integration                                       | `/blockchain`                         | ✅     | [Integration guide](docs/Blockchain_Integration_Guide.md), [Recording](docs/Blockchain_Recording.md), [Quickstart](docs/QUICKSTART_BLOCKCHAIN.md) |
| `cache`               | Global Redis cache, warming, invalidation, stats                                | `/cache`                              | ✅     | [README](src/cache/README.md)                                                                                                                     |
| `commissions`         | Agent commissions                                                               | `/commissions`                        | ✅     |                                                                                                                                                   |
| `common`              | Filters, interceptors, logger, middleware                                       | n/a                                   | ✅     | [Coding patterns](docs/CODING_PATTERNS.md)                                                                                                        |
| `config`              | Swagger / OpenAPI setup, API docs                                               | `/api/docs`                           | ✅     |                                                                                                                                                   |
| `content`             | CMS-style content                                                               | `/content`                            | ⚠️     |                                                                                                                                                   |
| `dashboard`           | User dashboard stats                                                            | `/dashboard`                          | ✅     |                                                                                                                                                   |
| `database`            | Prisma service, expired-record cleanup cron                                     | n/a                                   | ✅     | [Optimize queries](docs/Optimize_Queries.md)                                                                                                      |
| `documents`           | Uploads, versions, signed download URLs, expiry                                 | `/documents`                          | ✅     | [Document metadata](docs/Document_Metadata.md), [CDN for assets](docs/CDN_for_Assets.md)                                                          |
| `duplicate-detection` | Duplicate listing detection & merge                                             | `/properties/duplicates`              | ⚠️     |                                                                                                                                                   |
| `email`               | Email service, `mail` queue processor, templates, provider webhooks             | `/webhooks/email`                     | ✅     | [Templates](docs/Email_Templates.md), [Campaigns](docs/Email_Campaigns.md)                                                                        |
| `email-digest`        | Scheduled digest emails                                                         | `/email-digest`                       | ⚠️     |                                                                                                                                                   |
| `favorites`           | Saved properties                                                                | `/favorites`                          | ✅     |                                                                                                                                                   |
| `fraud`               | Fraud rules, alerts, auto-block                                                 | via `/admin/fraud/*`                  | ✅     | [README](src/fraud/README.md)                                                                                                                     |
| `health`              | Kubernetes probes                                                               | `/healthz`, `/readyz`, `/startupz`    | ✅     |                                                                                                                                                   |
| `i18n`                | Translations, localized errors                                                  | n/a                                   | ✅     |                                                                                                                                                   |
| `integrations`        | External integration adapters                                                   | `/integrations`                       | ✅     | [Adapters](docs/integration-adapters.md)                                                                                                          |
| `metrics`             | Prometheus metrics                                                              | `/metrics` (+ `METRICS_PORT`)         | ✅     | [Monitor performance](docs/Monitor_Performance.md)                                                                                                |
| `mortgage-calculator` | Mortgage calculations                                                           | `/mortgage-calculator`                | ✅     |                                                                                                                                                   |
| `neighborhoods`       | Neighborhood data                                                               | `/neighborhoods`                      | ⚠️     |                                                                                                                                                   |
| `notifications`       | In-app + WebSocket + SMS notifications                                          | `/notifications`, WS `/notifications` | ✅     | [README](src/notifications/README.md)                                                                                                             |
| `open-house`          | Open-house scheduling                                                           | `/open-house`                         | ✅     |                                                                                                                                                   |
| `properties`          | Listings, images, geocoding, expiry, tax strategies                             | `/properties`                         | ✅     | [README](src/properties/README.md), [Tax strategy](docs/Tax_Strategy_Suggestions.md)                                                              |
| `property-comparison` | Side-by-side comparison                                                         | `/property-comparison`                | ✅     |                                                                                                                                                   |
| `property-views`      | View tracking                                                                   | `/property-views`                     | ✅     |                                                                                                                                                   |
| `reports`             | Report scheduling utilities (no Nest module)                                    | n/a                                   | n/a    | [Generate reports](docs/Generate_Reports.md)                                                                                                      |
| `search`              | Property search, facets, autocomplete, analytics                                | `/search`                             | ✅     | [README](src/search/README.md), [Analytics privacy](docs/Search_Analytics_Privacy.md)                                                             |
| `sessions`            | Session listing & revocation                                                    | `/sessions`                           | ✅     |                                                                                                                                                   |
| `support-tickets`     | Support ticketing                                                               | `/support-tickets`                    | ✅     | [Handle support](docs/Handle_Support.md)                                                                                                          |
| `tracing`             | Request tracing interceptor                                                     | n/a                                   | ⚠️     |                                                                                                                                                   |
| `tracking`            | Event tracking                                                                  | `/track`                              | ✅     |                                                                                                                                                   |
| `transactions`        | Transactions, disputes, timeline, audit                                         | `/transactions`, `/disputes`          | ✅     | [README](src/transactions/README.md)                                                                                                              |
| `trust-score`         | Trust score & leaderboard                                                       | `/trust-score`                        | ✅     |                                                                                                                                                   |
| `users`               | Profiles, preferences, avatars, verification, activity logs, CSV import, search | `/users/*`, `/admin/activity-logs`    | ✅     | [Users](docs/users.md), [User management](docs/User_Management.md), [Audit logs](docs/View_Audit_Logs.md), [Avatars](src/users/README-AVATAR.md)  |
| `versioning`          | API versioning & deprecation headers                                            | n/a                                   | ✅     | [API versioning](docs/API_VERSIONING.md)                                                                                                          |
| `webhooks`            | Outbound signed webhooks with retry/backoff                                     | `/webhooks`                           | ⚠️     | [README](src/webhooks/README.md)                                                                                                                  |

More guides: [DEVELOPMENT.md](docs/DEVELOPMENT.md), [SECURITY.md](docs/SECURITY.md), [LOAD_TESTS.md](docs/LOAD_TESTS.md), [Rate-limit incident runbook](docs/INCIDENT_RUNBOOK_RATE_LIMIT.md), [CHANGELOG guide](docs/CHANGELOG_GUIDE.md).

## 🔧 Available Scripts

| Command                                      | Description                                          |
| -------------------------------------------- | ---------------------------------------------------- |
| `bash scripts/setup.sh`                      | One-command local environment setup                  |
| `npm run build`                              | Compile with `nest build` (cleans `dist/` first)     |
| `npm run start`                              | Start once                                           |
| `npm run start:dev`                          | Start in watch mode                                  |
| `npm run start:debug`                        | Watch mode with debugger                             |
| `npm run start:prod`                         | Run compiled `dist/main`                             |
| `npm run lint`                               | ESLint with `--fix` over `src` and `test`            |
| `npm run format`                             | Prettier over `src` and `test`                       |
| `npm test` / `npm run test:*`                | See [Testing](#-testing)                             |
| `npm run check:i18n`                         | Translation key symmetry check                       |
| `npm run migrate`                            | `prisma migrate dev`                                 |
| `npm run migrate:deploy`                     | `prisma migrate deploy` (production)                 |
| `npm run migrate:reset`                      | Drop and re-apply all migrations (**destroys data**) |
| `npm run db:generate`                        | Generate Prisma Client                               |
| `npm run db:seed` / `npm run seed`           | Seed the database                                    |
| `npm run db:studio`                          | Open Prisma Studio                                   |
| `npx ts-node scripts/validate-migrations.ts` | Check migrations for destructive changes             |
| `npx ts-node scripts/benchmark.ts`           | Run API benchmarks against a running app             |

A Husky **pre-commit** hook runs `lint-staged`: `eslint --fix --max-warnings=0` + Prettier on staged `*.ts`, and Prettier on `*.json` / `*.md`.

## 📊 Database Schema

### Core Models

- **User** - Platform users (buyers, sellers, agents, admins)
- **Property** - Real estate listings with detailed information
- **Transaction** - Property transactions with blockchain integration
- **Document** - Property-related documents and files

The authoritative schema is [prisma/schema.prisma](prisma/schema.prisma). It also covers sessions, fraud alerts, webhooks, backups, notifications, search analytics and more.

## 🔐 Environment Variables

Create a `.env` file based on `.env.example` (`.env.local` takes precedence if present):

```env
DATABASE_URL=postgresql://user:password@localhost:5432/propchain
PORT=3000
JWT_SECRET=your-secret-key            # at least 32 chars
JWT_REFRESH_SECRET=your-refresh-key   # at least 32 chars
REDIS_HOST=localhost
REDIS_PORT=6379
```

Module-specific variables (fraud, webhooks, SMS, backups, cache, audit archive) are documented in each module's README.

## 🚢 Deployment & CI

### GitHub Actions

| Workflow                                           | Jobs                                                                                                                                                                                                                                                                                                   | Trigger                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| [`ci.yml`](.github/workflows/ci.yml)               | `lint` (ESLint, zero warnings) · `validate-migrations` (`scripts/validate-migrations.ts`) · `test` (Postgres 15 service → `prisma db push` → `npm run test:all` → `npm run test:cov`) · `build` (needs the three above; uploads `dist/`) · `deploy-staging` (`develop`) · `deploy-production` (`main`) | ⚠️ **Currently disabled.** The `on:` block is commented out           |
| [`benchmark.yml`](.github/workflows/benchmark.yml) | Boots the app against Postgres 15 + Redis 7, runs `scripts/benchmark.ts`, uploads results, comments on the PR                                                                                                                                                                                          | ⚠️ **Currently disabled** (was: PRs, weekly Monday 06:00 UTC, manual) |

All jobs use Node 20. The deploy jobs are **placeholders** (`echo` only). No real deployment is automated yet.

Until CI is re-enabled, run the same checks locally before opening a PR:

```bash
npm ci
npm run lint -- --max-warnings=0
npx ts-node scripts/validate-migrations.ts
npm run test:all
npm run test:cov
npm run build
```

### Docker

See [Docker Workflow](#-docker-workflow-1175) above. The image entrypoint (`docker-entrypoint.sh`) runs `prisma migrate deploy` before `node dist/main`.

### Manual Deployment

```bash
npm ci
npm run build
npm run migrate:deploy
npm run start:prod
```

Runtime requirements beyond Node: PostgreSQL, Redis (cache, presence, BullMQ), and `pg_dump`/`psql` on the PATH if backups are used.

## 📝 API Endpoints

Routes are served **without a global prefix** (e.g. `/properties`, not `/api/properties`). The complete, always-current reference is the Swagger UI:

- `GET /api/docs`: Swagger UI
- `GET /api/openapi.json`: OpenAPI spec

### Health Check

- `GET /healthz`: liveness
- `GET /readyz`: readiness
- `GET /startupz`: startup probe
- `GET /metrics`: Prometheus metrics (served on `METRICS_PORT` instead when set)

### Users & Properties

See the [module table](#-modules) for base routes, and [docs/Auth_and_User_APIs.md](docs/Auth_and_User_APIs.md) / [src/properties/README.md](src/properties/README.md) for details.

### Tax Strategy Suggestions

- `GET /transactions/:transactionId/tax-strategies` - List tax strategy suggestions for a transaction
- `POST /transactions/:transactionId/tax-strategies` - Create a tax strategy suggestion
- `PATCH /transactions/:transactionId/tax-strategies/:strategyId` - Update a tax strategy suggestion

Tax strategy suggestions are informational only and are not legal or tax advice. See [docs/Tax_Strategy_Suggestions.md](docs/Tax_Strategy_Suggestions.md) for usage details.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines, branch naming conventions, PR expectations, and local test/lint instructions.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 👥 Support

For support, email support@propchain.com or join our Slack channel

## Developer Requirements — TypeScript & Linting

- **TypeScript strict mode:** The project now enables `strict` TypeScript checks. The base config is in [tsconfig.json](tsconfig.json#L1).
- **Key compiler flags enforced:** `strict`, `noImplicitAny`, `strictNullChecks`, `useUnknownInCatchVariables` and `noImplicitOverride` are enabled for app builds via [tsconfig.app.json](tsconfig.app.json#L1), which must not override them to `false`. Only `strictPropertyInitialization` is relaxed (NestJS DI-injected properties).
- **Guard:** `npm run check:tsconfig-strict` ([scripts/check-tsconfig-strict.js](scripts/check-tsconfig-strict.js)) fails if either config weakens these flags; CI runs it in the lint job.
- **ESLint rules:** `@typescript-eslint/no-explicit-any` is set to `error` and explicit boundary/return types are encouraged via `@typescript-eslint/explicit-module-boundary-types` and `@typescript-eslint/explicit-function-return-type` (set to `warn`). See [.eslintrc.js](.eslintrc.js#L1).

Local checks before committing/pushing:

```bash
# Install
npm ci

# Run linter (auto-fixable issues)
npm run lint

# Verify tsconfig strict flags are intact
npm run check:tsconfig-strict

# Build to verify TypeScript strict checks
npm run build
```

CI: `.github/workflows/ci.yml` defines lint (zero warnings), migration validation, tests and build jobs, but its triggers are **currently commented out**. See [Deployment & CI](#-deployment--ci).
