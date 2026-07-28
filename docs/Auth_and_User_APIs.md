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
- 400 Bad Request — registration already pending from this IP

---

## Email verification flow

Purpose: verify the email address used during registration.

After a successful `POST /auth/register`, the newly created user has `isVerified: false` and
cannot log in — login will return `401 Unauthorized` with the message
`"Please verify your email before logging in."`.

The user receives an email containing a verification link that points to the
`POST /auth/verify-email` endpoint:

**Request:**
```json
{ "token": "62-char-random-token" }
```

**Success response (200 OK):**
```json
{
  "message": "Email verified successfully",
  "user": { "id": "user_abc123", "email": "user@example.com", "firstName": "Jane" },
  "accessToken": "ey...",
  "refreshToken": "ey..."
}
```

Errors:
- 400 Bad Request — invalid or expired verification token
- 400 Bad Request — email already verified

### Token expiry

The verification token expires after the duration configured in
`EMAIL_VERIFICATION_EXPIRES_IN` (default: `24h`). When the token expires, the user must request
a new verification email via `POST /api/users/email/resend` (or re-register).

### Registration from the same IP

To prevent abuse, a second registration from the same IP is blocked until the pending email
verification is either completed or the token expires. This is a soft, in-memory guard.

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

> **Captcha-gated**: The login endpoint requires a valid reCAPTCHA token when the site has
> `CAPTCHA_SECRET_KEY` configured. Pass `"captchaToken": "<reCAPTCHA response>"` in the JSON body.
> The server validates the token against Google's siteverify API before processing the login.
> If `CAPTCHA_SECRET_KEY` is not set, captcha validation is skipped.

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

## Token Rotation & Reuse Detection

### How Token Rotation Works

When a client calls `POST /auth/refresh` with a valid refresh token:

1. The server issues a **new access token** and a **new refresh token**
2. The old refresh token is **blacklisted** (marked as used)
3. The new refresh token shares the same **token family** as the old one
4. The old token cannot be used again

### Token Families

Each login session generates a unique `tokenFamily` UUID. All refresh tokens issued during that session belong to the same family. This enables reuse detection.

### Reuse Detection

If a **blacklisted refresh token** is presented (i.e., a token that was already used):

1. The server detects the reuse attempt
2. **All tokens in the same family are immediately invalidated** (mass logout)
3. A fraud alert is created via `FraudService`
4. The user receives a `401` response with message: *"Token reuse detected. All sessions have been invalidated for security. Please login again."*

### What Triggers Mass Logout

- Presenting a refresh token that was already consumed
- Using a token from a family where reuse was already detected

### On-Call Response

When a token-reuse fraud alert fires:

1. Check the fraud alert dashboard for the affected user
2. Review the user's recent login IPs and user-agents
3. If legitimate (e.g., browser tab restored from snapshot), advise the user to re-login
4. If suspicious, consider blocking the user via the admin panel

### Event Details

| Event | Description |
|-------|-------------|
| `Token reuse detected` | A previously-used refresh token was presented |
| `Invalidating N tokens in family X` | All tokens in the family are being cleaned up |
| `Refresh token reuse detected` (fraud alert) | FraudService created a BLOCK-level alert |

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
