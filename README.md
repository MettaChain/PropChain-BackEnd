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
- **CI/CD Ready** - Automated testing and deployment pipeline

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

## � Password Reset

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

## �📋 Prerequisites

- Node.js >= 18.0.0
- PostgreSQL >= 14
- npm >= 8.0.0

## 🛠️ Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Set up your database URL in .env file
```

## ⚙️ Configuration

The application uses environment variables for configuration. Copy `.env.example` to `.env` and adjust the values as needed.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment mode | development |
| `JWT_SECRET` | JWT signing secret | Required |
| `JWT_REFRESH_SECRET` | JWT refresh token secret | Required |
| `JWT_ACCESS_EXPIRES_IN` | Access token expiration | 15m |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiration | 7d |
| `BCRYPT_ROUNDS` | Password hashing rounds | 12 |
| `PASSWORD_HISTORY_LIMIT` | Password history limit | 5 |

## 🗄️ Database Setup

```bash
# Generate Prisma Client
npm run db:generate

# Run migrations
npm run migrate

# (Optional) Seed database
npm run db:seed
```

## 🏃 Running the App

```bash
# Development mode
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

## 🧪 Testing

```bash
# Unit tests
npm test

# Test coverage
npm run test:cov

# Watch mode
npm run test:watch
```

## 📁 Project Structure

```
src/
├── database/           # Database configuration and Prisma service
├── users/              # User management module
├── properties/         # Property listings module
├── app.module.ts       # Main application module
├── app.controller.ts   # App controller with health check
└── main.ts             # Application entry point

prisma/
├── schema.prisma       # Database schema
└── seed.ts             # Database seeding
```

## 🔧 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build the application |
| `npm run start:dev` | Start in development mode with watch |
| `npm run start:prod` | Start in production mode |
| `npm run lint` | Run ESLint with auto-fix |
| `npm run format` | Format code with Prettier |
| `npm test` | Run tests |
| `npm run test:cov` | Run tests with coverage |
| `npm run migrate` | Run database migrations |
| `npm run migrate:deploy` | Deploy migrations to production |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:studio` | Open Prisma Studio |

## 📊 Database Schema

### Core Models

- **User** - Platform users (buyers, sellers, agents, admins)
- **Property** - Real estate listings with detailed information
- **Transaction** - Property transactions with blockchain integration
- **Document** - Property-related documents and files

## 🔐 Environment Variables

Create a `.env` file based on `.env.example`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/propchain
PORT=3000
JWT_SECRET=your-secret-key
```

## 🚢 Deployment

The CI/CD pipeline is configured in `.github/workflows/ci.yml`:

- **Develop branch** → Deploys to staging
- **Main branch** → Deploys to production

### Manual Deployment

```bash
# Build for production
npm run build

# Run migrations
npm run migrate:deploy

# Start application
npm run start:prod
```

## 📝 API Endpoints

### Health Check
- `GET /api/health` - Application health status

### Users
- `POST /api/users` - Create user
- `GET /api/users` - List all users
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Properties
- `POST /api/properties` - Create property
- `GET /api/properties` - List all properties
- `GET /api/properties/:id` - Get property by ID
- `PUT /api/properties/:id` - Update property
- `DELETE /api/properties/:id` - Delete property

### Tax Strategy Suggestions
- `GET /api/transactions/:transactionId/tax-strategies` - List tax strategy suggestions for a transaction
- `POST /api/transactions/:transactionId/tax-strategies` - Create a tax strategy suggestion
- `PATCH /api/transactions/:transactionId/tax-strategies/:strategyId` - Update a tax strategy suggestion

Tax strategy suggestions are informational only and are not legal or tax advice. See [docs/Tax_Strategy_Suggestions.md](docs/Tax_Strategy_Suggestions.md) for usage details.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 👥 Support

For support, email support@propchain.com or join our Slack channel
