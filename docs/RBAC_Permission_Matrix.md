# RBAC Endpoint Permission Matrix

This document provides a comprehensive overview of role-based access control (RBAC) for all protected endpoints in the PropChain backend API.

## User Roles

- **USER**: Default role for registered users. Can manage their own profile, properties, and transactions.
- **AGENT**: Can manage properties and assist with transactions. Has elevated permissions for property management.
- **ADMIN**: Full system access including user management, property administration, fraud detection, and system configuration.

## Permission Matrix

### Authentication Endpoints

| Endpoint                       | Method | USER | AGENT | ADMIN | Description               |
| ------------------------------ | ------ | ---- | ----- | ----- | ------------------------- |
| `/auth/register`               | POST   | ✅   | ✅    | ✅    | User registration         |
| `/auth/login`                  | POST   | ✅   | ✅    | ✅    | User login                |
| `/auth/refresh`                | POST   | ✅   | ✅    | ✅    | Refresh access token      |
| `/auth/logout`                 | POST   | ✅   | ✅    | ✅    | User logout               |
| `/auth/password-reset/request` | POST   | ✅   | ✅    | ✅    | Request password reset    |
| `/auth/password-reset/reset`   | POST   | ✅   | ✅    | ✅    | Reset password with token |

### User Management Endpoints

| Endpoint                           | Method | USER | AGENT | ADMIN | Description                          |
| ---------------------------------- | ------ | ---- | ----- | ----- | ------------------------------------ |
| `/users`                           | POST   | ❌   | ❌    | ✅    | Create user (Admin only)             |
| `/users`                           | GET    | ❌   | ❌    | ✅    | List all users (Admin only)          |
| `/users/search`                    | GET    | ❌   | ❌    | ✅    | Search users (Admin only)            |
| `/users/me/statistics`             | GET    | ✅   | ✅    | ✅    | Get current user statistics          |
| `/users/:id`                       | GET    | ❌   | ❌    | ✅    | Get user by ID (Admin only)          |
| `/users/:id`                       | PUT    | ❌   | ❌    | ✅    | Update user (Admin only)             |
| `/users/:id/block`                 | POST   | ❌   | ❌    | ✅    | Block user (Admin only)              |
| `/users/:id/unblock`               | POST   | ❌   | ❌    | ✅    | Unblock user (Admin only)            |
| `/users/:id`                       | DELETE | ❌   | ❌    | ✅    | Delete user (Admin only)             |
| `/users/me/profile`                | GET    | ✅   | ✅    | ✅    | Get own profile                      |
| `/users/me/profile`                | PUT    | ✅   | ✅    | ✅    | Update own profile                   |
| `/users/:id/export`                | POST   | ✅*  | ✅*   | ✅    | Export user data (own or admin)      |
| `/users/export/download/:filename` | GET    | ✅*  | ✅*   | ✅    | Download export (own or admin)       |
| `/users/me/deactivate`             | POST   | ✅   | ✅    | ✅    | Deactivate own account               |
| `/users/:id/verify`                | POST   | ❌   | ❌    | ✅    | Verify user (Admin only)             |
| `/users/:id/unverify`              | POST   | ❌   | ❌    | ✅    | Unverify user (Admin only)           |
| `/users/:id/deactivate`            | POST   | ❌   | ❌    | ✅    | Admin deactivate user                |
| `/users/:id/reactivate`            | POST   | ❌   | ❌    | ✅    | Reactivate user (Admin only)         |
| `/users/me/preferences`            | PUT    | ✅   | ✅    | ✅    | Update preferences                   |
| `/users/me/referral-stats`         | GET    | ✅   | ✅    | ✅    | Get referral stats                   |
| `/users/me/referrals`              | GET    | ✅   | ✅    | ✅    | Get own referrals                    |
| `/users/me/login-history`          | GET    | ✅   | ✅    | ✅    | Get login history                    |
| `/users/scheduled-deletion`        | GET    | ❌   | ❌    | ✅    | Get scheduled deletions (Admin only) |
| `/users/delete-scheduled`          | POST   | ❌   | ❌    | ✅    | Delete scheduled users (Admin only)  |

*USER and AGENT can only access their own data; ADMIN can access any user's data.

### Property Endpoints

| Endpoint                  | Method | USER | AGENT | ADMIN | Description                        |
| ------------------------- | ------ | ---- | ----- | ----- | ---------------------------------- |
| `/properties`             | POST   | ✅   | ✅    | ✅    | Create property                    |
| `/properties`             | GET    | ✅   | ✅    | ✅    | List properties                    |
| `/properties/:id`         | GET    | ✅   | ✅    | ✅    | Get property by ID                 |
| `/properties/:id`         | PUT    | ❌   | ✅    | ✅    | Update property (Agent/Admin only) |
| `/properties/:id`         | DELETE | ❌   | ❌    | ✅    | Delete property (Admin only)       |
| `/properties/:id/approve` | PATCH  | ❌   | ❌    | ✅    | Approve property (Admin only)      |
| `/properties/:id/reject`  | PATCH  | ❌   | ❌    | ✅    | Reject property (Admin only)       |

### Transaction Endpoints

| Endpoint                                 | Method | USER | AGENT | ADMIN | Description                             |
| ---------------------------------------- | ------ | ---- | ----- | ----- | --------------------------------------- |
| `/transactions`                          | POST   | ❌   | ✅    | ✅    | Create transaction (Agent/Admin only)   |
| `/transactions`                          | GET    | ✅   | ✅    | ✅    | List transactions                       |
| `/transactions/:id`                      | GET    | ✅   | ✅    | ✅    | Get transaction by ID                   |
| `/transactions/:id`                      | PUT    | ❌   | ✅    | ✅    | Update transaction (Agent/Admin only)   |
| `/transactions/:id/record-on-blockchain` | POST   | ❌   | ✅    | ✅    | Record on blockchain (Agent/Admin only) |
| `/transactions/reminders/send`           | POST   | ❌   | ❌    | ✅    | Send reminders (Admin only)             |
| `/transactions/:id/disputes`             | POST   | ✅   | ✅    | ✅    | Create dispute                          |
| `/transactions/:id/disputes/:id/resolve` | PATCH  | ❌   | ❌    | ✅    | Resolve dispute (Admin only)            |
| `/transactions/:id/disputes/:id/status`  | PATCH  | ❌   | ❌    | ✅    | Update dispute status (Admin only)      |

### Document Endpoints

| Endpoint         | Method | USER | AGENT | ADMIN | Description                    |
| ---------------- | ------ | ---- | ----- | ----- | ------------------------------ |
| `/documents`     | POST   | ✅   | ✅    | ✅    | Upload document                |
| `/documents`     | GET    | ✅   | ✅    | ✅    | List documents                 |
| `/documents/:id` | GET    | ✅   | ✅    | ✅    | Get document by ID             |
| `/documents/:id` | DELETE | ✅*  | ✅*   | ✅    | Delete document (own or admin) |

*USER and AGENT can only delete their own documents; ADMIN can delete any.

### Admin Endpoints

| Endpoint                                 | Method | USER | AGENT | ADMIN | Description                       |
| ---------------------------------------- | ------ | ---- | ----- | ----- | --------------------------------- |
| `/admin/dashboard`                       | GET    | ❌   | ❌    | ✅    | Get admin dashboard               |
| `/admin/backups`                         | GET    | ❌   | ❌    | ✅    | List backups                      |
| `/admin/backups/status`                  | GET    | ❌   | ❌    | ✅    | Get backup status                 |
| `/admin/backups/schedule`                | GET    | ❌   | ❌    | ✅    | Get backup schedule               |
| `/admin/backups/schedule`                | PUT    | ❌   | ❌    | ✅    | Update backup schedule            |
| `/admin/backups/run`                     | POST   | ❌   | ❌    | ✅    | Run backup                        |
| `/admin/backups/:id/restore`             | POST   | ❌   | ❌    | ✅    | Restore backup                    |
| `/admin/backups/:id/download`            | GET    | ❌   | ❌    | ✅    | Download backup                   |
| `/admin/users`                           | GET    | ❌   | ❌    | ✅    | List users (admin view)           |
| `/admin/users/:id`                       | PATCH  | ❌   | ❌    | ✅    | Update user (admin)               |
| `/admin/users/:id/block`                 | POST   | ❌   | ❌    | ✅    | Block user (admin)                |
| `/admin/users/:id/unblock`               | POST   | ❌   | ❌    | ✅    | Unblock user (admin)              |
| `/admin/properties/moderation/queue`     | GET    | ❌   | ❌    | ✅    | Get moderation queue              |
| `/admin/properties/:id/approve`          | POST   | ❌   | ❌    | ✅    | Approve property (admin)          |
| `/admin/properties/:id/reject`           | POST   | ❌   | ❌    | ✅    | Reject property (admin)           |
| `/admin/properties/:id/flag`             | POST   | ❌   | ❌    | ✅    | Flag property (admin)             |
| `/admin/properties/moderation/bulk`      | POST   | ❌   | ❌    | ✅    | Bulk moderate properties          |
| `/admin/transactions/monitoring`         | GET    | ❌   | ❌    | ✅    | Monitor transactions              |
| `/admin/transactions/monitoring/summary` | GET    | ❌   | ❌    | ✅    | Transaction monitoring summary    |
| `/admin/transactions/:id/status`         | PATCH  | ❌   | ❌    | ✅    | Update transaction status (admin) |
| `/admin/fraud/alerts`                    | GET    | ❌   | ❌    | ✅    | List fraud alerts                 |
| `/admin/fraud/alerts/summary`            | GET    | ❌   | ❌    | ✅    | Fraud alerts summary              |
| `/admin/fraud/alerts/:id`                | GET    | ❌   | ❌    | ✅    | Get fraud alert details           |
| `/admin/fraud/alerts/:id`                | PATCH  | ❌   | ❌    | ✅    | Review fraud alert                |
| `/admin/fraud/alerts/:id/notes`          | POST   | ❌   | ❌    | ✅    | Add fraud alert note              |
| `/admin/fraud/alerts/:id/block-user`     | POST   | ❌   | ❌    | ✅    | Block user from fraud alert       |
| `/admin/fraud/users/:id/scan`            | POST   | ❌   | ❌    | ✅    | Scan user for fraud               |
| `/admin/fraud/properties/:id/scan`       | POST   | ❌   | ❌    | ✅    | Scan property for fraud           |

### Neighborhood Endpoints

| Endpoint                                  | Method | USER | AGENT | ADMIN | Description                       |
| ----------------------------------------- | ------ | ---- | ----- | ----- | --------------------------------- |
| `/neighborhoods`                          | GET    | ✅   | ✅    | ✅    | List neighborhoods                |
| `/neighborhoods/:id`                      | GET    | ✅   | ✅    | ✅    | Get neighborhood by ID            |
| `/neighborhoods`                          | POST   | ❌   | ❌    | ✅    | Create neighborhood (Admin only)  |
| `/neighborhoods/:id`                      | PUT    | ❌   | ❌    | ✅    | Update neighborhood (Admin only)  |
| `/neighborhoods/:id`                      | DELETE | ❌   | ❌    | ✅    | Delete neighborhood (Admin only)  |
| `/neighborhoods/:id/schools`              | POST   | ❌   | ❌    | ✅    | Add school (Admin only)           |
| `/neighborhoods/:id/schools/:schoolId`    | DELETE | ❌   | ❌    | ✅    | Remove school (Admin only)        |
| `/neighborhoods/:id/amenities`            | POST   | ❌   | ❌    | ✅    | Add amenity (Admin only)          |
| `/neighborhoods/:id/amenities/:amenityId` | DELETE | ❌   | ❌    | ✅    | Remove amenity (Admin only)       |
| `/neighborhoods/property/:propertyId`     | PATCH  | ❌   | ✅    | ✅    | Link property to neighborhood     |
| `/neighborhoods/property/:propertyId`     | DELETE | ❌   | ✅    | ✅    | Unlink property from neighborhood |

### Verification Documents Endpoints

| Endpoint                                    | Method | USER | AGENT | ADMIN | Description                                  |
| ------------------------------------------- | ------ | ---- | ----- | ----- | -------------------------------------------- |
| `/users/verification-documents`             | POST   | ✅   | ✅    | ✅    | Upload verification document                 |
| `/users/verification-documents`             | GET    | ✅   | ✅    | ✅    | List own verification documents              |
| `/admin/verification-documents`             | GET    | ❌   | ❌    | ✅    | List all verification documents (Admin only) |
| `/admin/verification-documents/:id/approve` | POST   | ❌   | ❌    | ✅    | Approve verification document (Admin only)   |
| `/admin/verification-documents/:id/reject`  | POST   | ❌   | ❌    | ✅    | Reject verification document (Admin only)    |

### User Preferences Endpoints

| Endpoint             | Method | USER | AGENT | ADMIN | Description        |
| -------------------- | ------ | ---- | ----- | ----- | ------------------ |
| `/users/preferences` | GET    | ✅   | ✅    | ✅    | Get preferences    |
| `/users/preferences` | PUT    | ✅   | ✅    | ✅    | Update preferences |

### Activity Log Endpoints

| Endpoint               | Method | USER | AGENT | ADMIN | Description                        |
| ---------------------- | ------ | ---- | ----- | ----- | ---------------------------------- |
| `/users/activity-logs` | GET    | ✅   | ✅    | ✅    | Get own activity logs              |
| `/admin/activity-logs` | GET    | ❌   | ❌    | ✅    | Get all activity logs (Admin only) |

### Webhooks Endpoints

| Endpoint    | Method | USER | AGENT | ADMIN | Description           |
| ----------- | ------ | ---- | ----- | ----- | --------------------- |
| `/webhooks` | POST   | ✅   | ✅    | ✅    | Handle webhook events |

## API Key Scopes

Role checks (`USER` / `AGENT` / `ADMIN`) apply to bearer-token (JWT) callers. API keys are additionally constrained by a **scope** so an integration key can be limited independently of the role of the user it belongs to.

### Scope Model

| Scope   | Grants                                              | Notes                                  |
| ------- | --------------------------------------------------- | -------------------------------------- |
| `read`  | Non-mutating endpoints (`GET` / `HEAD` / `OPTIONS`) |                                        |
| `write` | Mutating endpoints                                  | Implies `read`                         |
| `*`     | Every scope                                         | `admin` and `all` are accepted aliases |

Scopes are stored on the API key as its `permissions` array. A key with `['read']` can read but receives `403 Forbidden` on any endpoint that requires `write`.

Keys created before scope enforcement (empty `permissions`) are treated as legacy **unscoped** keys and receive the default `read` + `write` scopes for backward compatibility. Grant explicit scopes (`read`, `write`) to new keys so the limitation actually applies.

### Declaration and Enforcement

Routes declare the scopes they need with `@RequireScopes()`, and `KeyPermissionsGuard` enforces them against the key that authenticated the request:

```typescript
@UseGuards(JwtAuthGuard, ApiKeyAuthGuard, KeyPermissionsGuard)
@Controller('trust-score')
export class TrustScoreController {
  @RequireScopes('read')
  @Get('me')
  getMyTrustScore() {}

  @RequireScopes('write')
  @Post('me/calculate')
  calculateMyTrustScore() {}
}
```

- Routes without `@RequireScopes()` are unaffected.
- JWT callers are skipped by this guard — their access is governed by `RolesGuard`.
- API-key callers must hold **every** required scope or receive `403 Forbidden`.

Scoped enforcement currently applies to the trust-score endpoints and `GET /auth/api-keys/validate`.

## Implementation Details

### Role Decorator Usage

Protected endpoints use the `@Roles()` decorator in combination with `@UseGuards(JwtAuthGuard, RolesGuard)`:

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Get('admin/users')
getAllUsers() {
  // Only admins can access
}
```

### Multiple Roles

Some endpoints allow multiple roles:

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.AGENT, UserRole.ADMIN)
@Post(':id')
updateProperty() {
  // Both AGENT and ADMIN can access
}
```

### Public Endpoints

Endpoints without `@UseGuards(JwtAuthGuard)` are public and accessible to all users (authenticated and unauthenticated).

### Self-Service vs Admin Access

Some endpoints have conditional access based on ownership:

- **Self-Service**: Users can access their own data
- **Admin Access**: Admins can access any user's data

This is typically implemented with additional logic in the controller or service layer.

## Security Best Practices

1. **Always validate roles on the server side** - Never rely on client-side checks
2. **Use the most restrictive role necessary** - Apply the principle of least privilege
3. **Audit role changes** - Log all role modifications for security auditing
4. **Regular permission reviews** - Periodically review and update role permissions
5. **Document role changes** - Keep this matrix updated when adding new endpoints

## Testing RBAC

When testing RBAC:

1. Test with each role (USER, AGENT, ADMIN)
2. Verify unauthorized access returns 403 Forbidden
3. Verify unauthenticated access returns 401 Unauthorized
4. Test edge cases (ownership checks, conditional permissions)

## Future Enhancements

- Consider adding more granular permissions (e.g., separate READ and WRITE permissions)
- Implement resource-level permissions for fine-grained access control
- Add permission groups for easier management of related permissions
- Consider adding a SUPER_ADMIN role for system-level operations
