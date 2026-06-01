# Changelog

All notable changes to PropChain-BackEnd are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/)
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Changelog documentation and maintenance guide

### Changed

### Deprecated

### Removed

### Fixed

### Security

---

## [1.0.0] - 2026-06-01

### Added
- **User Management**: Registration, authentication, and profile management with JWT tokens
- **Role-Based Access Control**: USER, AGENT, and ADMIN roles with route protection
- **Property Listings**: Create, manage, and search property listings
- **Transaction Tracking**: Record and track real estate transactions with blockchain integration
- **Document Management**: Store and manage property-related documents with signing support
- **Tax Strategy Suggestions**: Store non-binding tax structuring suggestions for transactions
- **Email Digest System**: Scheduled email notifications for user property updates
- **Blockchain Integration**: Record transactions on blockchain with hash generation and verification
- **Fraud Detection**: ML-based fraud detection system with anomaly analysis
- **API Key Management**: Generate and manage API keys with permission-based access control
- **Session Management**: Secure user session tracking with multi-device support
- **Search Functionality**: Full-text search for properties with faceted filtering
- **Admin Dashboard**: Comprehensive admin interface for user and property management
- **Open House Management**: Schedule and manage open house viewings
- **Property Comparison**: Compare multiple properties side-by-side
- **Notifications**: Real-time notifications via WebSocket connections
- **GraphQL API**: Full GraphQL schema for flexible querying
- **Swagger Documentation**: Auto-generated API documentation

### Fixed
- Race condition in concurrent document uploads
- Memory leak in WebSocket connection handling
- Incorrect user role checks in disputes controller
- SQL injection vulnerability in search queries
- Email sending failures with retry logic

### Security
- Implemented password hashing with bcrypt
- Added JWT token validation and expiration
- Enforced HTTPS-only cookie transmission
- Rate limiting on authentication endpoints (5 attempts/15 minutes)
- Validated all file type uploads to prevent malicious script execution
- Database connection pooling and query parameterization

---

## Legend

- **Added**: New features and capabilities
- **Changed**: Changes to existing functionality
- **Deprecated**: Features marked for removal in future versions
- **Removed**: Features removed from this release
- **Fixed**: Bug fixes and resolved issues
- **Security**: Security vulnerability patches and hardening improvements

---

For details on how to maintain this changelog, see [CHANGELOG_GUIDE.md](./docs/CHANGELOG_GUIDE.md).
