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

#### Database Migrations

| Feature | Migration |
|---------|-----------|
| Location & search logs | [`20260222084710_location`](prisma/migrations/20260222084710_location), [`20260222091519_add_search_logs`](prisma/migrations/20260222091519_add_search_logs) |
| Password history | [`20260324073730_add_password_history`](prisma/migrations/20260324073730_add_password_history) |
| API key rotation analytics | [`20260324084550_add_api_key_rotation_analytics`](prisma/migrations/20260324084550_add_api_key_rotation_analytics) |
| Composite indexes | [`20260325120000_composite_indexes`](prisma/migrations/20260325120000_composite_indexes) |
| SEO & soft delete | [`20260330000000_add_seo_and_soft_delete_fields`](prisma/migrations/20260330000000_add_seo_and_soft_delete_fields.sql) |
| Auth security foundation | [`20260422000000_add_auth_security_foundation`](prisma/migrations/20260422000000_add_auth_security_foundation.sql) |
| Google OAuth | [`20260422000001_add_google_oauth`](prisma/migrations/20260422000001_add_google_oauth) |
| User preferences & verification docs | [`20260422000001_add_user_preferences_and_verification_documents`](prisma/migrations/20260422000001_add_user_preferences_and_verification_documents) |
| Session management | [`20260422170000_add_session_management`](prisma/migrations/20260422170000_add_session_management.sql) |
| Trust score | [`20260422180000_add_trust_score`](prisma/migrations/20260422180000_add_trust_score.sql) |
| API key permissions & usage | [`20260423000000_add_api_key_permissions_and_usage`](prisma/migrations/20260423000000_add_api_key_permissions_and_usage.sql) |
| Document features | [`20260424000000_add_document_features`](prisma/migrations/20260424000000_add_document_features.sql) |
| Fraud detection | [`20260424010000_add_fraud_detection`](prisma/migrations/20260424010000_add_fraud_detection) |
| Database backup management | [`20260425093000_add_database_backup_management`](prisma/migrations/20260425093000_add_database_backup_management) |
| Email digest & transaction audit | [`20260429000000_add_email_digest`](prisma/migrations/20260429000000_add_email_digest), [`20260429000000_add_transaction_audit_log`](prisma/migrations/20260429000000_add_transaction_audit_log) |
| Transaction lifecycle enforcement | [`20260429000000_enforce_transaction_status_lifecycle`](prisma/migrations/20260429000000_enforce_transaction_status_lifecycle) |
| Transaction documents | [`20260429001000_add_transaction_documents`](prisma/migrations/20260429001000_add_transaction_documents) |

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
