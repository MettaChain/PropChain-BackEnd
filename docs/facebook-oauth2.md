# Facebook OAuth2 Login

## Overview

This document describes the Facebook OAuth2 authentication system
implemented in `PropChain-BackEnd`. It allows users to log in with
their Facebook account, linking it to an existing account or creating
a new one automatically.

---

## How It Works

1. User visits `GET /auth/facebook`
2. They are redirected to Facebook to authorize the app
3. Facebook redirects back to `GET /auth/facebook/callback`
4. The strategy validates the profile and finds or creates a user
5. JWT tokens are returned to the client

---

## API Endpoints

### `GET /auth/facebook`
Initiates the Facebook OAuth2 login flow. Redirects to Facebook.

### `GET /auth/facebook/callback`
Handles the redirect from Facebook after authentication.

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe"
  },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "accessTokenExpiresIn": 900,
  "refreshTokenExpiresIn": 604800
}
```

---

## Environment Variables

Add these to your `.env` file:



Get these values from the [Facebook Developer Portal](https://developers.facebook.com).

---

## Account Linking Logic

| Scenario | Behaviour |
|----------|-----------|
| Facebook ID already linked | Returns existing user |
| Email matches existing account | Links Facebook ID to existing account |
| No matching account | Creates new account automatically |
| No email from Facebook | Creates account with generated email |

---

## Implementation

**Files:**
- `src/auth/strategies/facebook.strategy.ts` — Passport strategy
- `src/auth/guards/facebook-auth.guard.ts` — Auth guard
- `src/auth/auth.service.ts` — `validateFacebookUser` and `facebookLogin`
- `src/auth/auth.controller.ts` — Login and callback routes
- `src/auth/auth.module.ts` — Module registration
- `prisma/schema.prisma` — `facebookId` field on User model

---

## Security Assumptions

- `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` must never be committed to version control — always use environment variables
- New accounts created via Facebook are automatically marked as verified
- Passwords for Facebook-created accounts are randomly generated and not accessible to the user — they must use Facebook to log in
- The `facebookId` field is unique — one Facebook account per user

---

## Test Coverage

**File:** `src/auth/facebook-auth.spec.ts`

| Test | What it verifies |
|------|-----------------|
| returns existing user when facebookId matches | Account lookup by facebookId |
| links facebook account to existing user | Email-based account linking |
| creates new user when no existing account | New account creation |
| handles missing email from Facebook | Fallback email generation |
| returns tokens and user after successful login | JWT token issuance |
| returns user info after facebook login | User data in response |

---

## Related Files

- `src/auth/strategies/facebook.strategy.ts`
- `src/auth/guards/facebook-auth.guard.ts`
- `src/auth/auth.service.ts`
- `src/auth/auth.controller.ts`
- `src/auth/auth.module.ts`
- `prisma/schema.prisma`



