#!/usr/bin/env bash
# PropChain Developer Environment Setup Script
# Issue #926 - Single-command developer onboarding
# Usage: bash scripts/setup.sh

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_step()  { echo -e "\n${BOLD}==> $*${NC}"; }

# ─── Prerequisites check ──────────────────────────────────────────────────────
log_step "Checking prerequisites"

check_cmd() {
  local cmd=$1
  local min_version=${2:-}
  if command -v "$cmd" &>/dev/null; then
    log_info "$cmd found: $(${cmd} --version 2>&1 | head -1)"
  else
    log_error "$cmd is not installed. Please install it and re-run this script."
    exit 1
  fi
}

check_cmd node
check_cmd npm
check_cmd psql
check_cmd redis-cli

# Node.js version check (>= 18)
NODE_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 18 ]; then
  log_error "Node.js >= 18 is required (found $NODE_MAJOR). Please upgrade."
  exit 1
fi
log_info "Node.js version OK (>= 18)"

# npm version check (>= 8)
NPM_MAJOR=$(npm --version | cut -d. -f1)
if [ "$NPM_MAJOR" -lt 8 ]; then
  log_error "npm >= 8 is required (found $NPM_MAJOR). Please upgrade."
  exit 1
fi
log_info "npm version OK (>= 8)"

# ─── Environment file ─────────────────────────────────────────────────────────
log_step "Setting up environment"

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    log_info "Created .env from .env.example"
    log_warn "Please review .env and set the required values (DATABASE_URL, JWT_SECRET, etc.)"
  else
    log_warn ".env.example not found – creating minimal .env with defaults"
    cat > .env <<'EOF'
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/propchain
PORT=3000
NODE_ENV=development
JWT_SECRET=dev-jwt-secret-change-in-production
JWT_REFRESH_SECRET=dev-refresh-secret-change-in-production
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
BCRYPT_ROUNDS=10
REDIS_HOST=localhost
REDIS_PORT=6379
FRONTEND_URL=http://localhost:3000
BASE_URL=http://localhost:3000
API_URL=http://localhost:3000/api
EOF
    log_info "Created .env with development defaults"
  fi
else
  log_info ".env already exists – skipping"
fi

# ─── Install dependencies ─────────────────────────────────────────────────────
log_step "Installing Node.js dependencies"
npm ci
log_info "Dependencies installed"

# ─── Database setup ───────────────────────────────────────────────────────────
log_step "Setting up the database"

# Source the DATABASE_URL from .env (simple extraction, no subshell needed)
DATABASE_URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)
export DATABASE_URL

# Generate Prisma client
log_info "Generating Prisma client..."
npm run db:generate

# Run migrations
log_info "Running database migrations..."
if npm run migrate 2>&1; then
  log_info "Migrations applied successfully"
else
  log_warn "Migrations failed – attempting db push (dev mode)..."
  npx prisma db push --accept-data-loss || true
fi

# Optional seed
if [ "${SKIP_SEED:-false}" != "true" ]; then
  log_info "Seeding the database..."
  npm run db:seed 2>/dev/null && log_info "Database seeded" || log_warn "Seed script not found or failed – skipping"
fi

# ─── Done ─────────────────────────────────────────────────────────────────────
log_step "Setup complete!"
echo -e ""
echo -e "  ${GREEN}Start the development server:${NC}"
echo -e "    npm run start:dev"
echo -e ""
echo -e "  ${GREEN}Useful commands:${NC}"
echo -e "    npm test              – run unit tests"
echo -e "    npm run lint          – lint the codebase"
echo -e "    npm run db:studio     – open Prisma Studio"
echo -e "    npm run build         – production build"
echo -e ""
