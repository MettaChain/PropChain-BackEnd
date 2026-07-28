# PropChain Development Guide

## Prerequisites

| Tool       | Minimum Version | Recommended |
| ---------- | --------------- | ----------- |
| Node.js    | 18.0.0          | 20.x LTS    |
| npm        | 8.0.0           | 10.x        |
| PostgreSQL | 14              | 16          |
| Redis      | 6.0             | 7.x         |

## Environment Setup

### 1. Clone and install

```bash
git clone https://github.com/your-org/PropChain-BackEnd.git
cd PropChain-BackEnd
npm install
```

### 2. Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Key variables to configure:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/propchain"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET="your-secret-key-here"
JWT_EXPIRATION="15m"
JWT_REFRESH_EXPIRATION="7d"

# Google OAuth (optional)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Application
PORT=3000
NODE_ENV=development
BASE_URL="http://localhost:3000"
```

### 3. Database Setup

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run migrate

# Seed with test data
npm run db:seed
```

### 4. Start Development Server

```bash
npm run start:dev
```

The API will be available at `http://localhost:3000/api`.

- Swagger docs: `http://localhost:3000/api/docs`
- GraphQL playground: `http://localhost:3000/graphql`

## Available Scripts

| Script                  | Description                       |
| ----------------------- | --------------------------------- |
| `npm start`             | Start production server           |
| `npm run start:dev`     | Start with hot-reload             |
| `npm run start:debug`   | Start in debug mode               |
| `npm run build`         | Build for production              |
| `npm test`              | Run unit tests                    |
| `npm run test:watch`    | Run tests in watch mode           |
| `npm run test:cov`      | Run tests with coverage           |
| `npm run lint`          | Lint and auto-fix                 |
| `npm run format`        | Format with Prettier              |
| `npm run migrate`       | Run Prisma migrations             |
| `npm run migrate:reset` | Reset database and re-migrate     |
| `npm run db:seed`       | Seed database with test data      |
| `npm run seed`          | Seed database with realistic data |
| `npm run db:studio`     | Open Prisma Studio                |
| `npm run db:generate`   | Regenerate Prisma client          |

## Debugging

### VS Code

Add to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug NestJS",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/nest",
      "runtimeArgs": ["start", "--debug", "--watch"],
      "console": "integratedTerminal",
      "restart": true,
      "env": { "NODE_ENV": "development" }
    }
  ]
}
```

### Node Inspector

```bash
npm run start:debug
# Then open chrome://inspect in Chrome
```

## Common Issues

### Prisma Client Not Generated

```
Error: @prisma/client did not initialize yet
```

**Fix:**

```bash
npm run db:generate
```

### Port Already in Use

```
Error: listen EADDRINUSE: address already in use :::3000
```

**Fix:**

```bash
lsof -ti:3000 | xargs kill -9
```

### Redis Connection Refused

```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

**Fix:** Start Redis:

```bash
# macOS
brew services start redis

# Docker
docker run -d --name redis -p 6379:6379 redis:alpine
```

### Database Connection Refused

```
Error: Can't reach database server at localhost:5432
```

**Fix:**

```bash
# Ensure PostgreSQL is running
brew services start postgresql@16

# Or via Docker
docker run -d --name propchain-db \
  -e POSTGRES_USER=user \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=propchain \
  -p 5432:5432 postgres:16
```

### Migration Conflicts

```bash
npm run migrate:reset
npm run db:seed
```

> Warning: This deletes all data. Only use in development.

## Git Workflow

1. Create feature branch from `main`
2. Make changes
3. Pre-commit hooks run automatically (ESLint + Prettier)
4. Push and create PR
5. Address review feedback
6. Merge after approval

### Pre-commit Hooks

Husky + lint-staged run automatically on `git commit`:

- **ESLint** fixes on `.ts` files
- **Prettier** formats `.ts`, `.json`, `.md` files

If the hook fails, fix the issues before committing:

```bash
npm run lint    # Check for lint errors
npm run format  # Fix formatting
```
