# Auth & User APIs

This document describes the authentication and user-management REST endpoints, example payloads, expected responses, and common error codes.

Base path: `/auth` and `/api/users` (user management)

---

## Register — POST /auth/register

Purpose: create a new user account.

Request payload (JSON):

```json
{
  "email": "user@example.com",
  "password": "ComplexPass123!",
  "firstName": "Jane",
  "lastName": "Doe",
  "phone": "+15551234567"
}
```

Success response (201 Created):

```json
{
  "user": {
    "id": "user_abc123",
    "email": "user@example.com",
    "firstName": "Jane",
    "lastName": "Doe"
  },
  "accessToken": "ey...",
  "refreshToken": "ey..."
}
```

Errors:
- 400 Bad Request — validation failure (missing/weak password, invalid email)
- 400 Bad Request — email already exists

---

## Login — POST /auth/login

Purpose: authenticate and receive access/refresh tokens.

Request payload:

```json
{
  "email": "user@example.com",
  "password": "ComplexPass123!"
}
```

Success response (200 OK):

```json
{
  "user": { "id": "user_abc123", "email": "user@example.com", "firstName":"Jane" },
  "accessToken": "ey...",
  "refreshToken": "ey..."
}
```

Errors:
- 401 Unauthorized — invalid credentials
- 401 Unauthorized — account locked (after failed attempts)
- 401 Unauthorized — 2FA required or invalid 2FA code

---

## Refresh token — POST /auth/refresh

Request payload:

```json
{ "refreshToken": "ey..." }
```

Success (200): returns a new access + refresh token pair.

Errors:
- 401 Unauthorized — invalid or reused refresh token

---

## Logout — POST /auth/logout

Requires `Authorization: Bearer <accessToken>` and optionally `refreshToken` in the body to revoke.

Request payload:

```json
{ "refreshToken": "ey..." }
```

Success: 200 OK with a message.

---

## Password reset — request — POST /auth/password-reset/request

Request payload:

```json
{ "email": "user@example.com" }
```

Success: 200 OK (email sent if account exists). To avoid account enumeration the endpoint returns the same response whether or not the email exists.

Errors: 429 Too Many Requests (rate-limited)

---

## Password reset — reset — POST /auth/password-reset/reset

Request payload:

```json
{ "token": "reset-token", "newPassword": "NewComplexPass123!" }
```

Success: 200 OK. Errors:
- 400 Bad Request — invalid/expired token
- 400 Bad Request — password doesn't meet complexity

---

## User endpoints (users module)

Create user (admin) — POST /api/users

Get user — GET /api/users/:id

Update user — PUT /api/users/:id

Delete user — DELETE /api/users/:id

Typical responses mirror the `user` object shape and return 200 or 201 where appropriate. Authorization: endpoints that modify or list users require admin privileges.

Errors (common):
- 401 Unauthorized — missing/invalid token
- 403 Forbidden — insufficient role
- 404 Not Found — user not found
- 400 Bad Request — validation failure

---

## Error format

The API generally returns errors in the form:

```json
{ "statusCode": 400, "message": "Detailed message or array of messages" }
```

or for validation errors:

```json
{ "statusCode": 400, "message": ["field must be an email", "password is too weak"], "error": "Bad Request" }
```

---

Developer notes

- Use `Authorization: Bearer <accessToken>` for protected endpoints.
- Tokens: access tokens are short-lived; refresh tokens are used for rotation. Protect refresh tokens carefully.
- Rate limiting: login/register/password-reset endpoints are rate-limited — tests should account for throttling when running in parallel.
- For tests: prefer using test users and an ephemeral DB or the FakePrisma approach used in `test/e2e/auth-property.e2e-spec.ts` to avoid affecting production data.
